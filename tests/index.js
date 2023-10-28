const test = require('tape')
const { TuioToTouch, dimensionsToFakeElement } = require('../index.js')

function onceEvent (event, eventCb) {
  let handler
  const clearHandler = () => {
    window.removeEventListener(event, handler)
  }

  return [
    new Promise((resolve, reject) => {
      let timer = null
      handler = (...args) => {
        eventCb(...args)
        clearHandler()
        clearTimeout(timer)
        resolve()
      }
      window.addEventListener(event, handler)

      timer = setTimeout(() => {
        clearHandler()
        reject(Error(`Event [${event}] never fired`))
      }, 1 * 1000)
    }).finally(clearHandler),
    clearHandler
  ]
}

test('TuioToTouch', (t) => {
  t.test('touch lifecycle', async (t) => {
    t.plan(7)

    const t2t = new TuioToTouch(dimensionsToFakeElement(100, 100))

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
    const [gotTouchStart] = onceEvent('touchstart', (touch) => {
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
    const [gotTouchMove] = onceEvent('touchmove', (touch) => {
      t.pass('got touchmove')
    })
    t2t.parseTUIO({
      elements: [
        ['/tuio/2Dcur', 'source', 'TuioPad@10.0.0.1'],
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
    const [gotTouchEnd] = onceEvent('touchend', (touch) => {
      t.pass('got touchend')
    })
    t2t.parseTUIO({
      elements: [
        ['/tuio/2Dcur', 'source', 'TuioPad@10.0.0.1'],
        ['/tuio/2Dcur', 'alive'],
        ['/tuio/2Dcur', 'fseq', 3000]
      ],
      oscType: 'bundle'
    })
    t.equal(Object.keys(t2t.touches).length, 0, 'removed dead touch')

    await gotTouchEnd
  })

  t.test('adjusts coordinates', async (t) => {
    const width = 1000
    const height = 750

    const tuioX = 0.5
    const tuioY = 0.1

    const t2t = new TuioToTouch(dimensionsToFakeElement(width, height, { x: 123, y: 456 }))

    // First touch
    const [gotTouchStart] = onceEvent('touchstart', (event) => {
      const { touches } = event
      const touch = touches[0]

      t.equal(touch.screenX, width * tuioX + 123, 'screenX')
      t.equal(touch.screenY, height * tuioY + 456, 'screenY')
      t.equal(touch.clientX, width * tuioX + 123, 'clientX')
      t.equal(touch.clientY, height * tuioY + 456, 'clientY')
      t.equal(touch.pageX, width * tuioX + 123, 'pageX')
      t.equal(touch.pageY, height * tuioY + 456, 'pageY')
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

  t.test('skips old tuio events', async (t) => {
    t.plan(2)
    const t2t = new TuioToTouch(dimensionsToFakeElement(100, 100))

    // First touch
    const [gotTouchStart] = onceEvent('touchstart', (event) => {
      t.equal(event.touches[0].clientX, 50, 'got correct X')
      t.equal(event.touches[0].clientY, 50, 'got correct Y')
    })

    // Faster fire
    t2t.parseTUIO({
      elements: [
        ['/tuio/2Dcur', 'source', 'TuioPad@10.0.0.1'],
        ['/tuio/2Dcur', 'alive', 12],
        [
          '/tuio/2Dcur',
          'set',
          12,
          0.5,
          0.5,
          0,
          0,
          0
        ],
        ['/tuio/2Dcur', 'fseq', 3]
      ],
      oscType: 'bundle'
    })

    const [, clearHandler] = onceEvent('touchstart', (event) => {
      t.fail('should never get two touch starts')
    })

    // Slow fire
    t2t.parseTUIO({
      elements: [
        ['/tuio/2Dcur', 'source', 'TuioPad@10.0.0.1'],
        ['/tuio/2Dcur', 'alive', 10],
        [
          '/tuio/2Dcur',
          'set',
          10,
          0,
          0,
          0,
          0,
          0
        ],
        ['/tuio/2Dcur', 'fseq', 1]
      ],
      oscType: 'bundle'
    })

    await gotTouchStart
    clearHandler()
  })

  t.test('dont skip frames from different source', async (t) => {
    t.plan(4)
    const t2t = new TuioToTouch(dimensionsToFakeElement(100, 100))

    const source1 = 'TuioPad@10.0.0.1'
    const source2 = 'TuioPad@10.0.0.9'

    // First touch
    const [gotTouchStart] = onceEvent('touchstart', (event) => {
      t.equal(event.touches[0].clientX, 50, 'got correct X')
      t.equal(event.touches[0].clientY, 50, 'got correct Y')
    })

    // Source 1 w/ later fseq
    t2t.parseTUIO({
      elements: [
        ['/tuio/2Dcur', 'source', source1],
        ['/tuio/2Dcur', 'alive', 12],
        [
          '/tuio/2Dcur',
          'set',
          12,
          0.5,
          0.5,
          0,
          0,
          0
        ],
        ['/tuio/2Dcur', 'fseq', 1000]
      ],
      oscType: 'bundle'
    })

    const [gotTouchStart2] = onceEvent('touchstart', (event) => {
      t.equal(event.touches[0].clientX, 0, 'got 2nd X')
      t.equal(event.touches[0].clientY, 0, 'got 2nd Y')
    })

    // Source 2 w/ earlier fseq
    t2t.parseTUIO({
      elements: [
        ['/tuio/2Dcur', 'source', source2],
        ['/tuio/2Dcur', 'alive', 10],
        [
          '/tuio/2Dcur',
          'set',
          10,
          0,
          0,
          0,
          0,
          0
        ],
        ['/tuio/2Dcur', 'fseq', 1]
      ],
      oscType: 'bundle'
    })

    await gotTouchStart
    await gotTouchStart2
  })
})
