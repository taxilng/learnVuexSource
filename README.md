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