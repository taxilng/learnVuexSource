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
     // 这边分行写容易无解，根据js运算符优先级，问号大于赋值
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
