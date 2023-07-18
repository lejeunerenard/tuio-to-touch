const { Server } = require('node-osc')
const { TuioToTouch } = require('../index.js')

globalThis.window = { pageXOffset: 0, pageYOffset: 0 }

const t2t = new TuioToTouch(100, 100)
const s = new Server(3333, '0.0.0.0', () => {
  console.log(`Server listing to: ${s.host}:${s.port}`)
})
s.on('message', (msg, rinfo) => {
  console.log('message', msg)
}).on('bundle', t2t.parseTUIO.bind(t2t))
