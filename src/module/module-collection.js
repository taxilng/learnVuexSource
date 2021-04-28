import Module from './module'
import { assert, forEachValue } from '../util'
// 它的实例只有一个 root属性，根模块
export default class ModuleCollection {
  constructor (rawRootModule) {
    // register root module (Vuex.Store options)
    this.register([], rawRootModule, false)
  }

  get (path) {
    // 刚开始是 this.root.__children[path[0]][path[1]], 假如path = []，那么结果就是this.root
    return path.reduce((module, key) => {
      return module.getChild(key)
    }, this.root)
  }

  getNamespace (path) {
    let module = this.root
    return path.reduce((namespace, key) => {
      module = module.getChild(key)
      return namespace + (module.namespaced ? key + '/' : '')
    }, '')
  }

  update (rawRootModule) {
    update([], this.root, rawRootModule)
  }

  register (path, rawModule, runtime = true) {
    if (__DEV__) {
      // 开发环境下，判断getter,mutations,actions的格式是否书写正确
      assertRawModule(path, rawModule)
    }
    // 那就是在 register 传入的第二个参数，而register在 constructor时调用
    // 那就看new ModuleCollection(rawRootModule) 传入的第一个参数
    // 另一种情况就是动态注册模块，传入rawModule
    const newModule = new Module(rawModule, runtime)
    //根节点在new ModuleCollection 的path是[],才满足。 动态注册是必须要填path的
    if (path.length === 0) {
      this.root = newModule 
      console.log('newModule', newModule);
    } else {
      //假如是一级组件的话，那么parent = this.root
      const parent = this.get(path.slice(0, -1))
      //把子组件添加到父组件里面 path[path.length - 1]，就拿path数组的最后一位；
      parent.addChild(path[path.length - 1], newModule)
    }

    // register nested modules 注册嵌套组件
    /**
     * 例如 
        modules： {
            account: {
                state: { name: 1 }, 
                // 嵌套模块
                modules: {
                    // 继承父模块的命名空间
                    myPage: {
                        state: { zs:1 },
                    },
                }
            }
        }
    */
    if (rawModule.modules) {
      //此时key就是myPage;rawChildModule = {state: { zs:1 }};
      forEachValue(rawModule.modules, (rawChildModule, key) => {
        // path.concat(key) 就是 ['account','myPage']
        this.register(path.concat(key), rawChildModule, runtime)
      })
    }
  }

  unregister (path) {
    const parent = this.get(path.slice(0, -1))
    const key = path[path.length - 1]
    const child = parent.getChild(key)

    if (!child) {
      if (__DEV__) {
        console.warn(
          `[vuex] trying to unregister module '${key}', which is ` +
          `not registered`
        )
      }
      return
    }

    if (!child.runtime) {
      return
    }

    parent.removeChild(key)
  }

  isRegistered (path) {
    const parent = this.get(path.slice(0, -1))
    const key = path[path.length - 1]

    if (parent) {
      return parent.hasChild(key)
    }

    return false
  }
}

function update (path, targetModule, newModule) {
  if (__DEV__) {
    assertRawModule(path, newModule)
  }

  // update target module
  targetModule.update(newModule)

  // update nested modules
  if (newModule.modules) {
    for (const key in newModule.modules) {
      if (!targetModule.getChild(key)) {
        if (__DEV__) {
          console.warn(
            `[vuex] trying to add a new module '${key}' on hot reloading, ` +
            'manual reload is needed'
          )
        }
        return
      }
      update(
        path.concat(key),
        targetModule.getChild(key),
        newModule.modules[key]
      )
    }
  }
}

const functionAssert = {
  assert: value => typeof value === 'function',
  expected: 'function'
}

const objectAssert = {
  assert: value => typeof value === 'function' ||
    (typeof value === 'object' && typeof value.handler === 'function'),
  expected: 'function or object with "handler" function'
}

const assertTypes = {
  getters: functionAssert,
  mutations: functionAssert,
  actions: objectAssert
}

function assertRawModule (path, rawModule) {
 // key的参考，getters
  Object.keys(assertTypes).forEach(key => {
    // 假设这个模块没有 getters 那么直接停止
    if (!rawModule[key]) return

    const assertOptions = assertTypes[key]

    forEachValue(rawModule[key], (value, type) => {
      assert(
        // 判断getters的值是否是函数
        assertOptions.assert(value),
        //如果不是，则触发这个
        makeAssertionMessage(path, key, type, value, assertOptions.expected)
      )
    })
  })
}

function makeAssertionMessage (path, key, type, value, expected) {
    // getters 应该是 function，但是 getter.getName
  let buf = `${key} should be ${expected} but "${key}.${type}"`
  if (path.length > 0) {
      //在模块名foo中
    buf += ` in module "${path.join('.')}"`
  }
  // 是 "{\"getName\":1}" 这种数据
  buf += ` is ${JSON.stringify(value)}.`
  return buf
}
