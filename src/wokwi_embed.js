/*
 * Wokwi experimental-embed client for JumperIDE.
 *
 * Wokwi's experimental embed (https://wokwi.com/experimental/embed) is a
 * login-free simulator: on load it posts a MessagePort to the parent, and we
 * exchange files over it. We provide our own code editor (see wokwi_tab.js);
 * the embed is the diagram editor + simulator. We seed it with files and read
 * the user's LIVE diagram edits back — no Wokwi save/URL/login needed.
 *
 * Uses Wokwi's official @wokwi/client library (APIClient + MessagePortTransport).
 */

import { APIClient, MessagePortTransport } from '@wokwi/client/browser'

// Any unique string works as a client_id (no registration required).
export const WOKWI_EMBED_CLIENT_ID = 'wokwi_client_jumperless_ide'
export const WOKWI_EMBED_URL = `https://wokwi.com/experimental/embed?client_id=${WOKWI_EMBED_CLIENT_ID}`
const WOKWI_ORIGIN = 'https://wokwi.com'

/** Thin manager around one embed iframe + its APIClient. */
export class WokwiEmbed {
    /**
     * @param {HTMLIFrameElement} iframe iframe to point at the embed (its src is set here)
     * @param {{log?:Function}} [opts]
     */
    constructor(iframe, { log = () => {} } = {}) {
        this.iframe = iframe
        this.log = log
        this.client = null
        this.transport = null
        this.connected = false
        this._connectedResolve = null
        this._connectedPromise = new Promise((r) => { this._connectedResolve = r })

        // The embed posts its MessagePort to the parent on load.
        this._onWindowMessage = (event) => {
            if (event.origin !== WOKWI_ORIGIN) return
            const port = event.data && event.data.port
            if (!port || typeof port.postMessage !== 'function') return
            if (this.client) return // already connected
            this._attach(port)
        }
        window.addEventListener('message', this._onWindowMessage)

        iframe.src = WOKWI_EMBED_URL
    }

    _attach(port) {
        this.transport = new MessagePortTransport(port)
        this.client = new APIClient(this.transport)
        this.client.connected.then(() => {
            this.connected = true
            this.log('Wokwi embed connected', 'ok')
            this._connectedResolve(this)
        }).catch((e) => this.log(`Embed connect failed: ${e.message}`, 'warn'))
    }

    /** Resolves once the embed has connected. */
    whenConnected() { return this._connectedPromise }

    /** Seed the sandbox with project files (diagram/sketch are convenience names). */
    async seed({ diagram, sketch, files = [] } = {}) {
        if (!this.client) throw new Error('Embed not connected')
        if (diagram != null) {
            const text = typeof diagram === 'string' ? diagram : JSON.stringify(diagram, null, 2)
            await this.client.fileUpload('diagram.json', text)
        }
        if (sketch != null) await this.client.fileUpload('sketch.ino', sketch)
        for (const f of files) {
            if (f && f.name && f.name !== 'sketch.ino' && f.name !== 'diagram.json') {
                await this.client.fileUpload(f.name, f.content ?? '')
            }
        }
    }

    /** Upload a single file (e.g. push the user's edited sketch into the sim). */
    async uploadFile(name, content) {
        if (!this.client) throw new Error('Embed not connected')
        await this.client.fileUpload(name, content)
    }

    /** Read the current diagram.json from the sandbox (the user's live edits). */
    async getDiagram() {
        if (!this.client) throw new Error('Embed not connected')
        const text = await this.client.fileDownload('diagram.json')
        return JSON.parse(typeof text === 'string' ? text : new TextDecoder().decode(text))
    }

    /** Read the current sketch.ino from the sandbox. */
    async getSketch() {
        if (!this.client) throw new Error('Embed not connected')
        const text = await this.client.fileDownload('sketch.ino')
        return typeof text === 'string' ? text : new TextDecoder().decode(text)
    }

    destroy() {
        window.removeEventListener('message', this._onWindowMessage)
        try { this.client && this.client.close() } catch (_) {}
        this.client = null
        this.connected = false
    }
}
