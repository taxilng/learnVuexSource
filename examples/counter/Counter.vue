<template>
    <div id="app">
        Clicked: {{ $store.state.count }} times, count is {{ evenOrOdd }}.
        <button @click="lehe">promise</button>
        <button @click="increment">+</button>
        <button @click="decrement">-</button>
        <button @click="incrementIfOdd">Increment if odd</button>
        <button @click="incrementAsync">Increment async</button>
    </div>
</template>

<script>
import { mapGetters, mapActions } from 'vuex'
import xu from './demo.js'
export default {
    computed: mapGetters([
        'evenOrOdd'
    ]),
    mounted(){
        console.log(xu);
    },
    methods: {
        ...mapActions([
            'increment',
            'decrement',
            'incrementIfOdd',
            'incrementAsync'
        ]),
        lehe(){
            this.increment().then(res => {
                console.log(343, res);
            })
        }
    }
}
</script>
