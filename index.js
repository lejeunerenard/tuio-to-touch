const debug = require('debug')

const d = {
  log: debug('tuio-to-touch'),
  bundle: debug('tuio-to-touch:bundle')
}

const RADIUS = 5

function TuioToTouch (referenceElement) {
  this.touches = {}
  this.prevTouches = {}

  this.referenceElement = referenceElement
  this.fseq = {}
  this.seenSources = []
  this.messagePreBundles = {}
  this.currentPreBundleSource = ''
  // d.log('tuio2touch offset', this.offset, 'width', this.width, 'height', this.height)
}

TuioToTouch.prototype.coerceToBrowserTouch = function coerceToBrowserTouch (touch) {
  const boundingRect = this.referenceElement.getBoundingClientRect()

  const touchRelativeToEl = {
    x: boundingRect.width * touch.TUIOX,
    y: boundingRect.height * touch.TUIOY
  }

  const clientX = touchRelativeToEl.x + boundingRect.x
  const clientY = touchRelativeToEl.y + boundingRect.y
  d.log('tuio2touch client', clientX, clientY)

  // Calculate elements relative position to the document
  // source: https://stackoverflow.com/a/26230989/630490
  const body = document.body
  const docEl = document.documentElement

  const scrollTop = window.pageYOffset || docEl.scrollTop || body.scrollTop
  const scrollLeft = window.pageXOffset || docEl.scrollLeft || body.scrollLeft

  const clientTop = docEl.clientTop || body.clientTop || 0
  const clientLeft = docEl.clientLeft || body.clientLeft || 0

  const elRelativeToDocument = {
    x: boundingRect.left + scrollLeft - clientLeft,
    y: boundingRect.top + scrollTop - clientTop
  }

  // Page is offset from client
  const pageX = elRelativeToDocument.x + touchRelativeToEl.x
  const pageY = elRelativeToDocument.y + touchRelativeToEl.y
  const screenX = pageX
  const screenY = pageY

  d.log('pageX', pageX, 'pageY', pageY, 'clientX', clientX, 'clientY', clientY)

  const browserTouch = new Touch({
    target: touch.target || document.elementFromPoint(clientX, clientY) || document.documentElement,
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
  const coerce = this.coerceToBrowserTouch.bind(this)
  const allTouches = Object.values(this.touches).map(coerce)
  // Touches might need to coerce a touch not in this.touches for touchend
  // events
  const browserTouches = touches.map((touch) =>
    // Use existing Touch object
    allTouches.find((otherTouch) => otherTouch.identifier === touch.sid) ||
    // or Make a new one
    coerce(touch))

  // Ensure targets are assigned before this via coerceToBrowserTouch
  const seenTargets = new WeakMap()
  for (const touch of touches) {
    const target = touch.target
    if (seenTargets.has(target)) continue

    const targetTouches = allTouches
      .filter((touch) => touch.target === target)

    const touchEvent = new TouchEvent(type, {
      cancelable: true,
      bubbles: true,
      composed: true,
      touches: allTouches,
      targetTouches,
      changedTouches: browserTouches
    })
    const dispatchTarget = document.contains(target) ? target : this.referenceElement
    dispatchTarget.dispatchEvent(touchEvent)
    seenTargets.set(target)
  }
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
      d.log('[updateEvents] marked as end', sid)
      endTouches.push(touch)
    } else if (touch.new) {
      touch.new = false
      d.log('[updateEvents] marked as start', sid)
      startTouches.push(touch)
    } else if (touch.TUIOX !== touch.prevTUIOX || touch.TUIOY !== touch.prevTUIOY) {
      d.log('[updateEvents] marked as move', sid)
      moveTouches.push(touch)
    } else {
      d.log('[updateEvents] touch didnt change', 'sid', sid, 'touch', JSON.stringify(touch, null, 2))
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
  d.log('createTouch', sid)
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

TuioToTouch.prototype.parseBundle = function parseBundle (bundle) {
  const { elements } = bundle

  const sourceMsg = elements[0]
  const source = sourceMsg[1] === 'source' ? sourceMsg[2] : '_default'

  const fseqMsg = elements[elements.length - 1]
  const fseq = fseqMsg[2]

  if (fseq <= (this.fseq[source] || 0)) {
    d.bundle('skip bundle. fseq is behind', 'fseq', fseq, 'source', source, 'this.fseq[source]', this.fseq[source])
    return
  }
  this.fseq[source] = fseq

  // Set source as seen assigning a sid prefix for it then
  if (this.seenSources.indexOf(source) === -1) this.seenSources.push(source)

  for (const msg of elements) {
    const type = msg[1].toLowerCase()
    d.bundle('processing msg', msg)

    // Skip if not 2Dcur
    if (!msg[0].match(is2Dcur)) {
      d.bundle('skip msg because not 2Dcur')
      continue
    }

    if (type === 'alive') {
      const prevIds = Object.keys(this.touches)

      const sIds = msg.slice(2)
      for (const sourceId of sIds) {
        const sid = this.getSID(source, sourceId)
        const index = prevIds.indexOf('' + sid)
        if (index === -1) {
          // New!
          d.bundle('create new from alive msg', sid)
          this.createTouch(sid)
        } else {
          // Remove from list because alive
          d.bundle('ack existing alive touch msg', index)
          prevIds.splice(index, 1)
        }
      }

      // Leftovers are dead
      for (const sid of prevIds) {
        d.bundle('sid marked as dead', sid)
        this.touches[sid].alive = false
      }
    } else if (type === 'set') {
      const sid = this.getSID(source, msg[2])
      d.bundle('set msg', sid)
      const touch = this.touches[sid] || this.createTouch(sid)
      d.bundle('[set] touch before', touch)

      // Set Previous
      touch.prevTUIOX = touch.TUIOX
      touch.prevTUIOY = touch.TUIOY
      touch.prevTUIOVX = touch.TUIOVX
      touch.prevTUIOVY = touch.TUIOVY

      touch.TUIOX = msg[3]
      touch.TUIOY = msg[4]
      touch.TUIOVX = msg[5]
      touch.TUIOVY = msg[6]

      d.bundle('[set] touch after', touch)
    }
  }
}

TuioToTouch.prototype.registerMessage = function registerMessage (msg) {
  // Skip if not 2Dcur
  if (!msg[0].match(is2Dcur)) return

  switch (msg[1]) {
    case 'source':
      this.currentPreBundleSource = msg[2]
      this.messagePreBundles[this.currentPreBundleSource] = []
      this.messagePreBundles[this.currentPreBundleSource].push(msg)
      break
    case 'set':
    case 'alive':
      if (!this.currentPreBundleSource) return
      this.messagePreBundles[this.currentPreBundleSource].push(msg)
      break
    case 'fseq':
      if (!this.currentPreBundleSource) return
      this.messagePreBundles[this.currentPreBundleSource].push(msg)
      // Parse as bundle now that everything is received
      this.parseBundle({ elements: this.messagePreBundles[this.currentPreBundleSource] })
      this.updateEvents()
      this.currentPreBundleSource = ''
      break
  }
}

TuioToTouch.prototype.parseTUIO = function parseTUIO (data) {
  if ('elements' in data) {
    this.parseBundle(data)
    this.updateEvents()
  } else {
    // Build up bundle one message at a time
    this.registerMessage(data)
  }
}

function dimensionsToFakeElement (width, height, offset = { x: 0, y: 0 }) {
  return {
    get offsetWidth () {
      return width
    },
    get offsetHeight () {
      return height
    },
    getBoundingClientRect () {
      return {
        x: offset.x,
        y: offset.y,
        width, // think about this as this might be different than original width
        height,
        // TODO lookup if this is ever not equal to x,y
        left: offset.x,
        top: offset.y
      }
    }
  }
}

const adjustToTuioToRegion = ({ x, y, x2, y2 }) => (bundle) => {
  const { elements } = bundle
  const keptIds = []
  const setsRemoved = elements.flatMap((msg) => {
    const type = msg[1].toLowerCase()
    d.bundle('removing set msg', msg)

    if (type === 'set') {
      const id = msg[2]
      const TUIOX = msg[3]
      const TUIOY = msg[4]
      if (TUIOX >= x && TUIOX <= x2 && TUIOY >= y && TUIOY <= y2) {
        keptIds.push(id)
        msg[3] = (TUIOX - x) / (x2 - x)
        msg[4] = (TUIOY - y) / (y2 - y)

        return [msg]
      } else return []
    }

    return [msg]
  })

  const newElements = setsRemoved.map((msg) => {
    const type = msg[1].toLowerCase()
    d.bundle('rempving alive msg', msg)

    if (type === 'alive') {
      const newMsg = [msg[0], msg[1]]
      for (let i = 2; i < msg.length; i++) {
        const id = msg[i]
        if (keptIds.indexOf(id) !== -1) {
          newMsg.push(id)
          d.bundle('rempving alive for', id)
        }
      }
      return newMsg
    }

    return msg
  })

  return { ...bundle, elements: newElements }
}

module.exports = { TuioToTouch, dimensionsToFakeElement, adjustToTuioToRegion }
