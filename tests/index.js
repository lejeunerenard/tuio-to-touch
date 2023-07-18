const test = require('tape')
const { TuioToTouch } = require('../index.js')

function onceEvent (event, eventCb) {
  return new Promise((resolve) => {
    const handler = (...args) => {
      eventCb(...args)
      window.removeEventListener(event, handler)
      resolve()
    }
    window.addEventListener(event, handler)
  })
}

test('TuioToTouch', (t) => {
  t.test('touch lifecycle', async (t) => {
    t.plan(7)

    const t2t = new TuioToTouch(100, 100)

    // 'Alive' messages
    t2t.parseTUIO({
      elements: [
        ['/tuio/2Dcur', 'source', 'TuioPad@10.0.0.1'],
        ['/tuio/2Dcur', 'alive'],
        ['/tuio/2Dcur', 'fseq', 100]
      ],
      oscType: 'bundle'
    })
    t.equal(Object.keys(t2t.touches).length, 0)

    // First touch
    const gotTouchStart = onceEvent('touchstart', (touch) => {
      t.pass('got touchstart')
    })

    t2t.parseTUIO({
      elements: [
        ['/tuio/2Dcur', 'source', 'TuioPad@10.0.0.1'],
        ['/tuio/2Dcur', 'alive', 12],
        [
          '/tuio/2Dcur',
          'set',
          12,
          0.5255398750305176,
          0.06844444572925568,
          0,
          0,
          0
        ],
        ['/tuio/2Dcur', 'fseq', 2390]
      ],
      oscType: 'bundle'
    })
    t.equal(Object.keys(t2t.touches).length, 1, 'created touch object')

    await gotTouchStart

    // Touch move
    const gotTouchMove = onceEvent('touchmove', (touch) => {
      t.pass('got touchmove')
    })
    t2t.parseTUIO({
      elements: [
        ['/tuio/2Dcur', 'source', 'TuioPad@10.0.0.151'],
        ['/tuio/2Dcur', 'alive', 12],
        [
          '/tuio/2Dcur',
          'set',
          12,
          0.8520500659942627,
          0.04266662523150444,
          0,
          0,
          0
        ],
        ['/tuio/2Dcur', 'fseq', 2796]
      ],
      oscType: 'bundle'
    })
    t.equal(Object.keys(t2t.touches).length, 1, 'kept existing touch object')

    await gotTouchMove

    // Touch end
    const gotTouchEnd = onceEvent('touchend', (touch) => {
      t.pass('got touchend')
    })
    t2t.parseTUIO({
      elements: [
        ['/tuio/2Dcur', 'source', 'TuioPad@10.0.0.151'],
        ['/tuio/2Dcur', 'alive'],
        ['/tuio/2Dcur', 'fseq', 3000]
      ],
      oscType: 'bundle'
    })
    t.equal(Object.keys(t2t.touches).length, 0, 'removed dead touch')

    await gotTouchEnd
  })

  t.test('adjusts coordinates', async (t) => {
    const width = 320
    const height = 240

    const tuioX = 0.5
    const tuioY = 0.7

    const t2t = new TuioToTouch(width, height)

    // First touch
    const gotTouchStart = onceEvent('touchstart', (event) => {
      const { touches } = event
      const touch = touches[0]

      t.equal(touch.screenX, width * tuioX, 'screenX')
      t.equal(touch.screenY, height * tuioY, 'screenY')
      t.equal(touch.clientX, width * tuioX, 'clientX')
      t.equal(touch.clientY, height * tuioY, 'clientY')
      t.equal(touch.pageX, width * tuioX, 'pageX')
      t.equal(touch.pageY, height * tuioY, 'pageY')
    })

    t2t.parseTUIO({
      elements: [
        ['/tuio/2Dcur', 'source', 'TuioPad@10.0.0.1'],
        ['/tuio/2Dcur', 'alive', 12],
        [
          '/tuio/2Dcur',
          'set',
          12,
          tuioX,
          tuioY,
          0,
          0,
          0
        ],
        ['/tuio/2Dcur', 'fseq', 2390]
      ],
      oscType: 'bundle'
    })

    await gotTouchStart
  })
})
