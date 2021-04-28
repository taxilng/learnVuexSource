import applyMixin from './mixin'
import devtoolPlugin from './plugins/devtool'
import ModuleCollection from './module/module-collection'
import { forEachValue, isObject, isPromise, assert, partial } from './util'

let Vue // bind on install

export class Store {
  constructor (options = {}) {
    // Auto install if it is not done yet and `window` has `Vue`.
    // To allow users to avoid auto-installation in some cases,
    // this code should be placed here. See #731
    /*
      在浏览器环境下，如果插件还未安装（!Vue即判断是否未安装），则它会自动安装。
      它允许用户在某些情况下避免自动安装。
    */
    if (!Vue && typeof window !== 'undefined' && window.Vue) {
      install(window.Vue)
    }

    if (__DEV__) {
      assert(Vue, `must call Vue.use(Vuex) before creating a store instance.`)
      assert(typeof Promise !== 'undefined', `vuex requires a Promise polyfill in this browser.`)
      assert(this instanceof Store, `store must be called with the new operator.`)
    }

    const {
      // 获取 options.plugins 属性，如果没有，则设置成 []， vuex 插件方法，监听事件执行一些方法
      plugins = [],
      // 严格模式，默认为false, 保证所有修改state必须走mutation不然抛出错误信息
      strict = false
    } = options
    // store internal state
    // 直接修改state的提示，默认开启
    this._committing = false
    this._actions = Object.create(null)
    this._actionSubscribers = []
    this._mutations = Object.create(null)
    this._wrappedGetters = Object.create(null)
    
    this._modules = new ModuleCollection(options)
    this._modulesNamespaceMap = Object.create(null)
    this._subscribers = []
    this._watcherVM = new Vue()
    this._makeLocalGettersCache = Object.create(null)

    // bind commit and dispatch to self
    //将构造函数的方法的this指向自身，而不是它的实例.这样指向不会错乱
    const store = this
    const { dispatch, commit } = this
    this.dispatch = function boundDispatch (type, payload) {
        // console.log('熊');
      return dispatch.call(store, type, payload)
    }
    this.commit = function boundCommit (type, payload, options) {
      return commit.call(store, type, payload, options)
    }

    // strict mode
    this.strict = strict
    // console.log('this._modules.root', this._modules);
    const state = this._modules.root.state

    // init root module.
    // this also recursively registers all sub-modules
    // and collects all module getters inside this._wrappedGetters
     /*初始化根module，这也同时递归注册了所有子module，收集所有module的getter到_wrappedGetters中去，this._modules.root代表根module才独有保存的Module对象*/
    //  console.log('shu', this._modules.root);
    // 这是初始化 根模块，只有 根模块才有 root属性
    installModule(this, state, [], this._modules.root)

    // initialize the store vm, which is responsible for the reactivity
    // (also registers _wrappedGetters as computed properties)
    //初始化负责反应性的store 实例
    //（还将_wrappedgeters注册为计算属性）
    resetStoreVM(this, state)

    // apply plugins 处理下插件的逻辑, 直接执行
    plugins.forEach(plugin => plugin(this))

    // 假如开启开发模式，利用vue.js devtool插件来提示
    const useDevtools = options.devtools !== undefined ? options.devtools : Vue.config.devtools
    if (useDevtools) {
      devtoolPlugin(this)
    }
  }
  // 重写 state的获取方法，从vue实例中的_data获取
  get state () {
    return this._vm._data.$$state
  }

  // 直接修改state，开发环境给予报错提示
  set state (v) {
    if (__DEV__) {
      assert(false, `use store.replaceState() to explicit replace store state.`)
    }
  }
  // commit方法
  commit (_type, _payload, _options) {
    // check object-style commit
    // 主要是针对 对象风格的提交方式 来统一参数
    const {
      type,
      payload,
      options
    } = unifyObjectStyle(_type, _payload, _options)

    const mutation = { type, payload }
    // 初始化时，会把所有的mutations放到 vm._mutations 中
    const entry = this._mutations[type]
    if (!entry) {
      if (__DEV__) {
        console.error(`[vuex] unknown mutation type: ${type}`)
      }
      return
    }
    // 先关闭修改提示，再调用
    this._withCommit(() => {
      //遍历执行
      entry.forEach(function commitIterator (handler) {
        handler(payload)
      })
    })
    //浅拷贝，暂时不知道作用 触发 plugin插件的subscribe回调
    this._subscribers
      .slice() // shallow copy to prevent iterator invalidation if subscriber synchronously calls unsubscribe
      .forEach(sub => sub(mutation, this.state))

    if (
      __DEV__ &&
      options && options.silent
    ) {
      console.warn(
        `[vuex] mutation type: ${type}. Silent option has been removed. ` +
        'Use the filter functionality in the vue-devtools'
      )
    }
  }
  // this.$store.dispatch方法
  dispatch (_type, _payload) {
    // check object-style dispatch
    // 统一参数格式
    const {
      type,
      payload
    } = unifyObjectStyle(_type, _payload)

    const action = { type, payload }
    const entry = this._actions[type]
    if (!entry) {
      if (__DEV__) {
        console.error(`[vuex] unknown action type: ${type}`)
      }
      return
    }

    try {
      //  也是plugins的 subscribeAction 回调触发, 支持function 或者 object，衔触发before，然后等action执行完毕，再触发after
      /**
        store.subscribeAction({
            before: (action, state) => {
                console.log(`before action ${action.type}`)
            },
            after: (action, state) => {
                console.log(`after action ${action.type}`)
            }
        })
       */
      this._actionSubscribers
        .slice() // shallow copy to prevent iterator invalidation if subscriber synchronously calls unsubscribe
        .filter(sub => sub.before)
        .forEach(sub => sub.before(action, this.state))
    } catch (e) {
      if (__DEV__) {
        console.warn(`[vuex] error in before action subscribers: `)
        console.error(e)
      }
    }
    // 如果action有多个函数，那么就需要Promise.all 全部完成后才返回数据
    const result = entry.length > 1
      ? Promise.all(entry.map(handler => handler(payload)))
      : entry[0](payload)
    // 只有在after或者error执行完毕后，才返回action结果
    return new Promise((resolve, reject) => {
      result.then(res => {
        try {
          // 成功的调用afert
          this._actionSubscribers
            .filter(sub => sub.after)
            .forEach(sub => sub.after(action, this.state))
        } catch (e) {
          if (__DEV__) {
            console.warn(`[vuex] error in after action subscribers: `)
            console.error(e)
          }
        }
        resolve(res)
      }, error => {
        try {
            // 失败的调用error
          this._actionSubscribers
            .filter(sub => sub.error)
            .forEach(sub => sub.error(action, this.state, error))
        } catch (e) {
          if (__DEV__) {
            console.warn(`[vuex] error in error action subscribers: `)
            console.error(e)
          }
        }
        reject(error)
      })
    })
  }

  // 订阅 store 的 mutation
  subscribe (fn, options) {
    return genericSubscribe(fn, this._subscribers, options)
  }
   // 订阅 store 的 action ，假如参数是函数，则放到before中，看文档API https://vuex.vuejs.org/zh/api/#subscribeaction
  subscribeAction (fn, options) {
    const subs = typeof fn === 'function' ? { before: fn } : fn
    return genericSubscribe(subs, this._actionSubscribers, options)
  }

  // 用vue的$watch来实现getter的监听
  // 响应式地侦听 fn 的返回值，当值改变时调用回调函数。fn 接收 store 的 state 作为第一个参数，其 getter 作为第二个参数。最后接收一个可选的对象参数表示 Vue 的 vm.$watch 方法的参数。要停止侦听，调用此方法返回的函数即可停止侦听
  watch (getter, cb, options) {
    if (__DEV__) {
      assert(typeof getter === 'function', `store.watch only accepts a function.`)
    }
    return this._watcherVM.$watch(() => getter(this.state, this.getters), cb, options)
  }
  // 全局替换state
  replaceState (state) {
    this._withCommit(() => {
      this._vm._data.$$state = state
    })
  }
  //注册一个动态模块
  registerModule (path, rawModule, options = {}) {
    if (typeof path === 'string') path = [path]

    if (__DEV__) {
      assert(Array.isArray(path), `module path must be a string or an Array.`)
      assert(path.length > 0, 'cannot register the root module by using registerModule.')
    }

    this._modules.register(path, rawModule)
    installModule(this, this.state, path, this._modules.get(path), options.preserveState)
    // reset store to update getters...
    resetStoreVM(this, this.state)
  }

  unregisterModule (path) {
    if (typeof path === 'string') path = [path]

    if (__DEV__) {
      assert(Array.isArray(path), `module path must be a string or an Array.`)
    }

    this._modules.unregister(path)
    this._withCommit(() => {
      const parentState = getNestedState(this.state, path.slice(0, -1))
      Vue.delete(parentState, path[path.length - 1])
    })
    resetStore(this)
  }

  hasModule (path) {
    if (typeof path === 'string') path = [path]

    if (__DEV__) {
      assert(Array.isArray(path), `module path must be a string or an Array.`)
    }

    return this._modules.isRegistered(path)
  }

  hotUpdate (newOptions) {
    this._modules.update(newOptions)
    resetStore(this, true)
  }

  _withCommit (fn) {
    const committing = this._committing
    this._committing = true
    fn()
    this._committing = committing
  }
}

function genericSubscribe (fn, subs, options) {
 // 将订阅的方法插入到this._subscribers 或者 this._actionSubscribers 中，默认plugins.prepend = true；每次都是插入在头部；也就是说后引入的插件，先执行；
  if (subs.indexOf(fn) < 0) {
    options && options.prepend
      ? subs.unshift(fn)
      : subs.push(fn)
  }
  // 返回了一个函数， 假如调用这个函数，就会取消订阅
  return () => {
    const i = subs.indexOf(fn)
    if (i > -1) {
      subs.splice(i, 1)
    }
  }
}

function resetStore (store, hot) {
  store._actions = Object.create(null)
  store._mutations = Object.create(null)
  store._wrappedGetters = Object.create(null)
  store._modulesNamespaceMap = Object.create(null)
  const state = store.state
  // init all modules
  installModule(store, state, [], store._modules.root, true)
  // reset vm
  resetStoreVM(store, state, hot)
}

function resetStoreVM (store, state, hot) {
    // 首次进入时是不存在，store._vm值的，将会在下面赋值
    const oldVm = store._vm
    // console.log('store', store);

  // bind store public getters
  store.getters = {}
  // reset local getters cache
  store._makeLocalGettersCache = Object.create(null)
  const wrappedGetters = store._wrappedGetters
  const computed = {}
  forEachValue(wrappedGetters, (fn, key) => {
    // fn 为 getters的函数
    // use computed to leverage its lazy-caching mechanism
    // direct inline function use will lead to closure preserving oldVm.
    // using partial to return function with only arguments preserved in closure environment.
    //使用computed来利用其延迟缓存机制
    //直接使用内联函数将导致保留闭包的oldVm。
    //在闭包环境中使用只保留参数的partial返回函数。
    // console.log('fn', fn);
    // 相当于 computed[key] = () => fn(store)
    computed[key] = partial(fn, store)
    // 改写store.getters[key] 的 get 为 store._vm[key] 
    Object.defineProperty(store.getters, key, {
      get: () => store._vm[key],
      enumerable: true // for local getters
    })
  })

  // use a Vue instance to store the state tree
  // suppress warnings just in case the user has added
  // some funky global mixins
  //使用Vue实例存储状态树 仅在用户添加 一些时髦的全球混合
  const silent = Vue.config.silent
//   console.log('silent', silent);
  // 将Vue的全局报错提示先暂时关闭，然后恢复
  Vue.config.silent = true
  // 给_vm赋值，是vue的实例化，将state存入
  // 利用vue的computed来缓存getters
  store._vm = new Vue({
    data: {
      $$state: state
    },
    computed
  })
  Vue.config.silent = silent

  // enable strict mode for new vm
  // 开启严格模式
  if (store.strict) {
    enableStrictMode(store)
  }
  // getter已经用computed缓存后的热更新
  if (oldVm) {
    if (hot) {
      // dispatch changes in all subscribed watchers
      // to force getter re-evaluation for hot reloading.
      // 关闭直接修改state的提示，并且把旧的state清空，getter也随之清空
      store._withCommit(() => {
        oldVm._data.$$state = null
      })
    }
    // 销毁旧的实例
    Vue.nextTick(() => oldVm.$destroy())
  }
}

function installModule (store, rootState, path, module, hot) {
  const isRoot = !path.length // 当第三个参数的length为0时，就标识根module
  const namespace = store._modules.getNamespace(path) // 根节点的话，就是 空字符串

  // register in namespace map
  //判断是否有 命名空间
//   console.log('xian', module, namespace === '');
  if (module.namespaced) {
    if (store._modulesNamespaceMap[namespace] && __DEV__) {
      console.error(`[vuex] duplicate namespace ${namespace} for the namespaced module ${path.join('/')}`)
    }
    // 放到命名空间的变量中
    store._modulesNamespaceMap[namespace] = module
  }

  // set state
  if (!isRoot && !hot) {
    const parentState = getNestedState(rootState, path.slice(0, -1))
    const moduleName = path[path.length - 1]
    store._withCommit(() => {
      if (__DEV__) {
        if (moduleName in parentState) {
          console.warn(
            `[vuex] state field "${moduleName}" was overridden by a module with the same name at "${path.join('.')}"`
          )
        }
      }
      Vue.set(parentState, moduleName, module.state)
    })
  }
  
  // 如果没有 命名空间 那么就把 dispatch 和 commit 注册在根节点
  const local = module.context = makeLocalContext(store, namespace, path)
//   console.log('dai', local);

  // 遍历
  module.forEachMutation((mutation, key) => {
    const namespacedType = namespace + key
    registerMutation(store, namespacedType, mutation, local)
  })

  module.forEachAction((action, key) => {
    const type = action.root ? key : namespace + key
    const handler = action.handler || action
    registerAction(store, type, handler, local)
  })

  module.forEachGetter((getter, key) => {
    const namespacedType = namespace + key
    registerGetter(store, namespacedType, getter, local)
  })
 /**
  * 遍历 modules 里面的,例如
   export default new Vuex.Store({
    modules: {
        products,
        cart,
        },
    })
  *  */ 
  module.forEachChild((child, key) => {
    // console.log('forEachChild', child, key);
    // 那么key就是 products；path.concat(key) 也是 products；
    installModule(store, rootState, path.concat(key), child, hot)
  })
}

/**
 * make localized dispatch, commit, getters and state
 * if there is no namespace, just use root ones
 * *进行本地化的分派、提交、getter和state
 *如果没有名称空间，就使用根名称空间
 */
function makeLocalContext (store, namespace, path) {
  const noNamespace = namespace === ''

  const local = {
    dispatch: noNamespace ? store.dispatch : (_type, _payload, _options) => {
      const args = unifyObjectStyle(_type, _payload, _options)
      const { payload, options } = args
      let { type } = args

      if (!options || !options.root) {
        type = namespace + type
        if (__DEV__ && !store._actions[type]) {
          console.error(`[vuex] unknown local action type: ${args.type}, global type: ${type}`)
          return
        }
      }

      return store.dispatch(type, payload)
    },

    commit: noNamespace ? store.commit : (_type, _payload, _options) => {
      const args = unifyObjectStyle(_type, _payload, _options)
      const { payload, options } = args
      let { type } = args

      if (!options || !options.root) {
        type = namespace + type
        if (__DEV__ && !store._mutations[type]) {
          console.error(`[vuex] unknown local mutation type: ${args.type}, global type: ${type}`)
          return
        }
      }

      store.commit(type, payload, options)
    }
  }

  // getters and state object must be gotten lazily
  // because they will be changed by vm update
  Object.defineProperties(local, {
    getters: {
      get: noNamespace
        ? () => store.getters
        : () => makeLocalGetters(store, namespace)
    },
    state: {
      get: () => getNestedState(store.state, path)
    }
  })

  return local
}

function makeLocalGetters (store, namespace) {
  if (!store._makeLocalGettersCache[namespace]) {
    const gettersProxy = {}
    const splitPos = namespace.length
    Object.keys(store.getters).forEach(type => {
      // skip if the target getter is not match this namespace
      if (type.slice(0, splitPos) !== namespace) return

      // extract local getter type
      const localType = type.slice(splitPos)

      // Add a port to the getters proxy.
      // Define as getter property because
      // we do not want to evaluate the getters in this time.
      Object.defineProperty(gettersProxy, localType, {
        get: () => store.getters[type],
        enumerable: true
      })
    })
    store._makeLocalGettersCache[namespace] = gettersProxy
  }

  return store._makeLocalGettersCache[namespace]
}
/**
 * 
 * @param {*} store 构造函数自身this
 * @param {*} type  handler就是我们定义的mutation的属性名
 * @param {*} handler handler就是我们定义的mutation的函数
 * @param {*} local 
 * 这个函数就是把 mutation方法，注册到 stroe._mutations里面了
 */
function registerMutation (store, type, handler, local) {
  const entry = store._mutations[type] || (store._mutations[type] = [])
  setTimeout(() => {
    //   console.log('entry', store._mutations, type, store._mutations[type], entry);
    }, 1000);
    entry.push(function wrappedMutationHandler (payload) {
        // console.log('local', local, local.state);
    //先把this指向给自身，local是当前节点了， payload传入的参数
    handler.call(store, local.state, payload)
  })
}

function registerAction (store, type, handler, local) {
 // 当不同的modules没有命名空间，action取了相同的名字，就会push到数组中依次执行。
  const entry = store._actions[type] || (store._actions[type] = [])
  entry.push(function wrappedActionHandler (payload) {
    let res = handler.call(store, {
      dispatch: local.dispatch,
      commit: local.commit,
      getters: local.getters,
      state: local.state,
      rootGetters: store.getters,
      rootState: store.state
    }, payload)
    // console.log('返回值', res);
    // 假如不是promise，将会转换成promise
    if (!isPromise(res)) {
      res = Promise.resolve(res)
    }
    //假如 安装了vue.js devtools 那么会有window全局属性__VUE_DEVTOOLS_GLOBAL_HOOK__
    // 并且 store.devtoolHook = window.__VUE_DEVTOOLS_GLOBAL_HOOK__
    if (store._devtoolHook) {
      // 返回的其实还是res 并且会在catch中触发报错提示
      return res.catch(err => {
        store._devtoolHook.emit('vuex:error', err)
        throw err
      })
    } else {
      // 生产环境 未安装devtools
      return res
    }
  })
}

function registerGetter (store, type, rawGetter, local) {
    // 如果存在的getter属性，就给予报错提示
  if (store._wrappedGetters[type]) {
    if (__DEV__) {
      console.error(`[vuex] duplicate getter key: ${type}`)
    }
    return
  }
  store._wrappedGetters[type] = function wrappedGetter (store) {
    return rawGetter(
      local.state, // local state
      local.getters, // local getters
      store.state, // root state
      store.getters // root getters
    )
  }
}
/*
 严格模式 需要阅读vue源码关于$watch方法
*/
function enableStrictMode (store) {
    // console.log('store', store._vm.$data === store._vm._data);
  store._vm.$watch(function () { return this._data.$$state }, () => {
    if (__DEV__) {
      assert(store._committing, `do not mutate vuex store state outside mutation handlers.`)
    }
  }, { deep: true, sync: true })
}

function getNestedState (state, path) {
  return path.reduce((state, key) => state[key], state)
}

// 统一对象样式
function unifyObjectStyle (type, payload, options) {
    /**
      store.commit({
        type: 'increment',
        amount: 10
      })
      针对这种写法来进行逻辑判断
     */
  if (isObject(type) && type.type) {
    options = payload
    payload = type
    type = type.type
  }
  // 校验 type必须为字符串
  if (__DEV__) {
    assert(typeof type === 'string', `expects string as the type, but found ${typeof type}.`)
  }

  return { type, payload, options }
}

export function install (_Vue) {
  // 其实Vue.use()已经有缓存了，这边不缓存我觉得问题也不大 避免重复安装
  if (Vue && _Vue === Vue) {
    if (__DEV__) {
      console.error(
        '[vuex] already installed. Vue.use(Vuex) should be called only once.'
      )
    }
    return
  }
  Vue = _Vue
  // 将vuexInit混淆进Vue的beforeCreate(Vue2.0)
  //详见 ./mixin.js文件
  applyMixin(Vue)
}
