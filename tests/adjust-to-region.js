const test = require('tape')
const { TuioToTouch, dimensionsToFakeElement, adjustToTuioToRegion } = require('../index.js')

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

test('adjust to region', (t) => {
  t.test('update bundle', (t) => {
    const region = {
      x: 0.25,
      y: 0.25,
      x2: 0.5,
      y2: 0.75
    }
    const toRegion = adjustToTuioToRegion(region)

    const regionBundle = toRegion({
      elements: [
        ['/tuio/2Dcur', 'source', 'TuioPad@10.0.0.1'],
        ['/tuio/2Dcur', 'alive', 12, 13],
        [
          '/tuio/2Dcur',
          'set',
          12,
          0.3,
          0.5,
          0,
          0,
          0
        ],
        [
          '/tuio/2Dcur',
          'set',
          13,
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

    t.deepEqual(regionBundle.elements[1], ['/tuio/2Dcur', 'alive', 12], 'filtered alive correctly')
    t.deepEqual(regionBundle.elements[2], [
      '/tuio/2Dcur',
      'set',
      12,
      (0.3 - 0.25) / (0.5 - 0.25),
      (0.5 - 0.25) / (0.75 - 0.25),
      0,
      0,
      0
    ], 'filtered alive correctly')
    t.deepEqual(regionBundle.elements[3], [
      '/tuio/2Dcur',
      'fseq',
      2390
    ], 'removed set for point outside of region')

    t.end()
  })

  t.test('touch lifecycle', async (t) => {
    t.plan(8)

    const t2t = new TuioToTouch(dimensionsToFakeElement(100, 100))

    const region = {
      x: 0.25,
      y: 0.25,
      x2: 0.5,
      y2: 0.75
    }
    const toRegion = adjustToTuioToRegion(region)

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

    const regionBundle = toRegion({
      elements: [
        ['/tuio/2Dcur', 'source', 'TuioPad@10.0.0.1'],
        ['/tuio/2Dcur', 'alive', 12, 13],
        [
          '/tuio/2Dcur',
          'set',
          12,
          0.3,
          0.5,
          0,
          0,
          0
        ],
        [
          '/tuio/2Dcur',
          'set',
          13,
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

    t2t.parseTUIO(regionBundle)
    t.equal(Object.keys(t2t.touches).length, 1, 'created touch object')

    await gotTouchStart

    // Touch move
    const [gotTouchMove] = onceEvent('touchmove', (touch) => {
      t.pass('got touchmove')
    })
    const [gotTouchStart2] = onceEvent('touchstart', (touch) => {
      console.log('touch', touch)
      t.pass('got touchstart for second touch point')
    })
    t2t.parseTUIO(toRegion({
      elements: [
        ['/tuio/2Dcur', 'source', 'TuioPad@10.0.0.1'],
        ['/tuio/2Dcur', 'alive', 12, 13],
        [
          '/tuio/2Dcur',
          'set',
          12,
          0.35,
          0.25,
          0,
          0,
          0
        ],
        [
          '/tuio/2Dcur',
          'set',
          13,
          0.3,
          0.5,
          0,
          0,
          0
        ],
        ['/tuio/2Dcur', 'fseq', 2796]
      ],
      oscType: 'bundle'
    }))
    t.equal(Object.keys(t2t.touches).length, 2, 'adds existing touch as new')

    await gotTouchMove
    await gotTouchStart2

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
})
