const debug = require('debug')

const d = {
  log: debug('tuio-to-touch')
}

const RADIUS = 5

function TuioToTouch (width = window.innerWidth, height = window.innerHeight, offset = { x: 0, y: 0 }) {
  this.touches = {}
  this.prevTouches = {}

  this.fseq = {}
  this.seenSources = []
  this.offset = offset
  this.width = width
  this.height = height
  d.log('tuio2touch offset', this.offset, 'width', this.width, 'height', this.height)
}

TuioToTouch.prototype.coerceToBrowserTouch = function coerceToBrowserTouch (touch) {
  const clientX = this.width * touch.TUIOX + this.offset.x
  const clientY = this.height * touch.TUIOY + this.offset.y
  d.log('tuio2touch client', clientX, clientY)

  // Page is offset from client
  const pageX = window.pageXOffset + clientX
  const pageY = window.pageYOffset + clientY
  const screenX = pageX
  const screenY = pageY

  const browserTouch = new Touch({
    target: touch.target || document.elementFromPoint(pageX, pageY) || document.documentElement,
    identifier: touch.sid,
    clientX,
    clientY,
    pageX,
    pageY,
    screenX,
    screenY,
    radiusX: RADIUS,
    radiusY: RADIUS
  })

  // Set it if elementFromPoint was used
  touch.target = browserTouch.target

  return browserTouch
}

TuioToTouch.prototype.getSID = function getSID (source, id) {
  const index = this.seenSources.indexOf(source)
  if (index === -1) throw Error('Received a getSID with an unknown source!')

  // 18 bit shift is psuedo arbitrary. I tried to split the binary size of js
  // numbers in half so the id could be the source's id prefixed with the index
  // of the seen source to make it unique.
  return index << 18 ^ id
}

TuioToTouch.prototype.createTouchEvent = function createTouchEvent (type, touches) {
  const allTouches = Object.keys(this.touches).map((sid) => this.coerceToBrowserTouch(this.touches[sid]))
  const browserTouches = touches.map((touch) => this.coerceToBrowserTouch(touch))

  // Ensure targets are assigned before this via coerceToBrowserTouch
  const target = touches[0].target
  const targetTouches = Object.keys(this.touches).map((sid) => this.touches[sid])
    .filter((touch) => touch.target === target)
    .map((touch) => this.coerceToBrowserTouch(touch))

  const touchEvent = new TouchEvent(type, {
    cancelable: true,
    bubbles: true,
    composed: true,
    touches: allTouches,
    targetTouches,
    changedTouches: browserTouches
  })
  target.dispatchEvent(touchEvent)
}

TuioToTouch.prototype.updateEvents = function updateEvents () {
  const startTouches = []
  const moveTouches = []
  const endTouches = []

  // Sort and update this.touches
  for (const sid in this.touches) {
    const touch = this.touches[sid]

    if (!touch.alive) {
      delete this.touches[sid]
      endTouches.push(touch)
    } else if (touch.new) {
      touch.new = false
      startTouches.push(touch)
    } else if (touch.TUIOX !== touch.prevTUIOX && touch.TUIOY !== touch.prevTUIOY) {
      moveTouches.push(touch)
    }
  }

  // Emit touchend
  if (endTouches.length) {
    this.createTouchEvent('touchend', endTouches)
  }

  // Emit touchstart
  if (startTouches.length) {
    this.createTouchEvent('touchstart', startTouches)
  }

  // Emit touchmove
  if (moveTouches.length) {
    this.createTouchEvent('touchmove', moveTouches)
  }
}

TuioToTouch.prototype.createTouch = function createTouch (sid) {
  this.touches[sid] = {
    alive: true,
    new: true,
    TUIOX: -1,
    TUIOY: -1,
    TUIOVX: -1,
    TUIOVY: -1,
    prevTUIOX: -1,
    prevTUIOY: -1,
    prevTUIOVX: -1,
    prevTUIOVY: -1,
    sid
  }
  return this.touches[sid]
}

const is2Dcur = /2Dcur$/

TuioToTouch.prototype.parseTUIO = function parseTUIO (bundle) {
  const { elements } = bundle
  let fseq = 0

  const sourceMsg = elements[0]
  const source = sourceMsg[1] === 'source' ? sourceMsg[2] : '_default'

  const fseqMsg = elements[elements.length - 1]
  fseq = fseqMsg[2]

  if (fseq <= (this.fseq[source] || 0)) return
  this.fseq[source] = fseq

  // Set source as seen assigning a sid prefix for it then
  if (this.seenSources.indexOf(source) === -1) this.seenSources.push(source)

  for (const msg of elements) {
    const type = msg[1].toLowerCase()

    // Skip if not 2Dcur
    if (!msg[0].match(is2Dcur)) continue

    if (type === 'alive') {
      const prevIds = Object.keys(this.touches)

      const sIds = msg.slice(2)
      for (const sourceId of sIds) {
        const sid = this.getSID(source, sourceId)
        const index = prevIds.indexOf('' + sid)
        if (index === -1) {
          // New!
          this.createTouch(sid)
        } else {
          // Remove from list because alive
          prevIds.splice(index, 1)
        }
      }

      // Leftovers are dead
      for (const sid of prevIds) {
        this.touches[sid].alive = false
      }
    } else if (type === 'set') {
      const sid = this.getSID(source, msg[2])
      const touch = this.touches[sid] || this.createTouch(sid)

      // Set Previous
      touch.prevTUIOX = touch.TUIOX
      touch.prevTUIOY = touch.TUIOY
      touch.prevTUIOVX = touch.TUIOVX
      touch.prevTUIOVY = touch.TUIOVY

      touch.TUIOX = msg[3]
      touch.TUIOY = msg[4]
      touch.TUIOVX = msg[5]
      touch.TUIOVY = msg[6]
    }
  }

  this.updateEvents()
}

module.exports = { TuioToTouch }
