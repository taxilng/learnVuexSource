import shop from '../../api/shop'

// initial state
const state = () => ({
  all: []
})

// getters
const getters = {
    getterdemo(){
        return 1
    }
}

// actions
const actions = {
  getAllProducts ({ commit }) {
    shop.getProducts(products => {
      commit('setProducts', products)
    })
  },
  addProductToCart(){
      console.log('就是玩儿');
  }
}

// mutations
const mutations = {
  setProducts (state, products) {
    state.all = products
  },

  decrementProductInventory (state, { id }) {
    const product = state.all.find(product => product.id === id)
    product.inventory--
  }
}

export default {
//   namespaced: true,
  state,
  getters,
  actions,
  mutations
}
