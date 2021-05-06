## 项目启动
``` bash
# 安装依赖
yarn 

# 项目运行
yarn dev

# 项目打包
yarn build
```

## 源码解析
1. 核心文件 src/store.js module/module.js  module/module-collection.js 三个文件

### vuex引入

 使用时
```js
import Vue from 'vue';
import Vuex from 'vuex';
import { mapState } from 'vuex' 
```
源码位置 src/index.js
```js
/*导出两次的原因，支持import两种写法
  import vuex from 'vuex' 
  import { mapState } from 'vuex' 
  灵活使用
*/
export default {
  Store,
  install,
  version: '__VERSION__',
  mapState,
  mapMutations,
  mapGetters,
  mapActions,
  createNamespacedHelpers,
  createLogger
}

export {
  Store,
  install,
  mapState,
  mapMutations,
  mapGetters,
  mapActions,
  createNamespacedHelpers,
  createLogger
}
```

### Vue.use(Vuex)
 使用语法
 ```js
 Vue.use(Vuex)
 ```
 源码解析
 ```js
 // Vue.use 本身的源码，是先看参数有没有install属性，例如Vuex.install,如果没有就直接把vuex当作函数执行Vuex()
 // 源码见 src/store.js 简单来说就做了重复安装的判断；然后就调用applyMixin方法
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

// applyMixin 方法详细见 src/mixin.js
```

### applyMixin 方法 src/mixin.js文件
```js
export default function (Vue) {
  //   console.log(Vue.version);
  // Vue.version 假设为2.5.22 那么version就为2
  const version = Number(Vue.version.split('.')[0])

  if (version >= 2) {
     //直接调用Vue2.x的静态方法mixin，具体看vue源码
     /* 
      Vue.mixin = function (mixin: Object) {
            //参数合并罢了
            this.options = mergeOptions(this.options, mixin)
            return this
      }
      vue源码最后的操作就是把beforeCreate生命周期这样属性的值 concat合并成数组
     */
    Vue.mixin({ beforeCreate: vuexInit })
  } else {
    // override init and inject vuex init procedure
    // for 1.x backwards compatibility.
    // vue1.x版本兼容写法，直接重写Vue 原型 _init方法
    // 这是一个常见的技巧，先保存原型方法为 _init 然后重写原型方法
    const _init = Vue.prototype._init
    Vue.prototype._init = function (options = {}) {
     // 这边分行写容易误解，根据js运算符优先级，问号大于赋值
     // vueInit方法传入 option.init里面，或数组或函数，具体要看vue1.x的 _init方法怎么接受参数的
      options.init = options.init
        ? [vuexInit].concat(options.init)
        : vuexInit

      _init.call(this, options) // 这里直接调用vue原始的原型init方法，将参数搞在options里面了,vuexInit位于数组的最后，所以是在初始化的最后执行，vue2.x是在beforeCreate就执行了
    }
  }

  /**
   * Vuex init hook, injected into each instances init hooks list.
   * Vuex init钩子，注入到每个实例init hook列表中。
   * Vue每个实例组件，就有了 this.$store属性了
   * 为什么optionns有store实例呢
   */

  function vuexInit () {
     /**
        new Vue({
            i18n,
            router,
            store,
            render: h => h(App)
        }).$mount('#app')
        这段代码中，可以看出store是作为参数传入new Vue() 初始化的参数中，
        然后在vue源码中vm.$option = option 会接受这个参数，
        所以 options.store 是存在的，并且格式大概率是对象。
        另外组件的初始化的话，是要走 options.parent.$store的
     */
    const options = this.$options
    // store injection
    if (options.store) {
      this.$store = typeof options.store === 'function'
        ? options.store()
        : options.store
    } else if (options.parent && options.parent.$store) {
      this.$store = options.parent.$store
    }
    
  }
}
 ```