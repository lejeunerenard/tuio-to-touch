const RADIUS = 5

module.exports = TuioToTouch

function TuioToTouch (width = window.innerWidth, height = window.innerHeight, offset = { x: 0, y: 0 }) {
  this.touches = {}
  this.prevTouches = {}

  this.fseq = 0
  this.offset = offset
  this.width = width
  this.height = height
}

TuioToTouch.prototype.coerceToBrowserTouch = function coerceToBrowserTouch (touch) {
  let clientX = this.width * touch.TUIOX + this.offset.x
  let clientY = this.height * touch.TUIOY + this.offset.y

  // Page is offset from client
  let pageX = window.pageXOffset + clientX
  let pageY = window.pageYOffset + clientY
  let screenX = pageX
  let screenY = pageY

  let browserTouch = new Touch({
    target: touch.target || document.elementFromPoint(pageX, pageY) || document.documentElement,
    identifier: touch.sid,
    clientX: clientX,
    clientY: clientY,
    pageX: pageX,
    pageY: pageY,
    screenX: screenX,
    screenY: screenY,
    radiusX: RADIUS,
    radiusY: RADIUS
  })

  // Set it if elementFromPoint was used
  touch.target = browserTouch.target

  return browserTouch
}

TuioToTouch.prototype.createTouchEvent = function createTouchEvent (type, touches) {
  let allTouches = Object.keys(this.touches).map((sid) => this.coerceToBrowserTouch(this.touches[sid]))
  let browserTouches = touches.map((touch) => this.coerceToBrowserTouch(touch))

  // Ensure targets are assigned before this via coerceToBrowserTouch
  let target = touches[0].target
  let targetTouches = Object.keys(this.touches).map((sid) => this.touches[sid])
    .filter((touch) => touch.target === target)
    .map((touch) => this.coerceToBrowserTouch(touch))

  let touchEvent = new TouchEvent(type, {
    cancelable: true,
    bubbles: true,
    composed: true,
    touches: allTouches,
    targetTouches: targetTouches,
    changedTouches: browserTouches
  })
  target.dispatchEvent(touchEvent)
}

TuioToTouch.prototype.updateEvents = function updateEvents () {
  let startTouches = []
  let moveTouches = []
  let endTouches = []

  // Sort and update this.touches
  for (let sid in this.touches) {
    let touch = this.touches[sid]

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
  if (endTouches.length){
    this.createTouchEvent('touchend', endTouches)
  }

  // Emit touchstart
  if (startTouches.length){
    this.createTouchEvent('touchstart', startTouches)
  }

  // Emit touchmove
  if (moveTouches.length){
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
    sid: sid
  }
  return this.touches[sid]
}

const is2Dcur = /2Dcur$/

TuioToTouch.prototype.parseTUIO = function parseTUIO (bundle) {
  let fseq = 0
  for (let msg of bundle) {
    if (msg[1].toLowerCase() !== 'fseq') continue

    fseq = msg[2]
    break
  }

  if (fseq <= this.fseq) return
  this.fseq = fseq

  for (let msg of bundle) {
    let type = msg[1].toLowerCase()

    // Skip if not 2Dcur
    if (!msg[0].match(is2Dcur)) continue

    if (type === 'alive') {
      let prevIds = Object.keys(this.touches)

      let sIds = msg.slice(2)
      for (let sid of sIds) {
        let index = prevIds.indexOf('' + sid)
        if (index === -1) {
          // New!
          this.createTouch(sid)
        } else {
          // Remove from list because alive
          prevIds.splice(index, 1)
        }
      }

      // Leftovers are dead
      for (let sid of prevIds) {
        this.touches[sid].alive = false
      }
    } else if (type === 'set') {
      let sid = msg[2]
      let touch = this.touches[sid] || this.createTouch(sid)

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
