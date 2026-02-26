import { addUpdateHandler } from './editor.js'
import { QSA, QS, QID } from './utils.js'


let currentTab = 0
let connected = false

// ─── Drag-between-panels state ────────────────────────────────────────────────

/** @type {{ tabEl: HTMLElement, paneEl: HTMLElement, origin: 'editor'|'terminal' }|null} */
let _dragState = null


/**
 *
 * @param {string} fn The file name (full path) to activate a tab for. If the tab already exists,
 * it will be selected
 * @returns {boolean} Returns true if a tab matching the given file name is found, else false
 */
export function displayOpenFile(fn) {
    const openTab = QS(`#editor-tabs [data-fn="${fn}"]`)
    if (!openTab) {
        return false
    }

    // if we found it already open, then show it and hide the rest
    _activateTab(openTab.dataset.tab)
    return true
}

/**
 *
 * @param {string} fn The file name (full path) that the tab will represent
 * @returns {HTMLElement} The element that will contain the file editor
 */
export function createTab(fn) {
    const tabContainer = QID("editor-tabs")
    const terminal = QID("terminal-container")

    // Deactivate ONLY top tabs since new tabs are created in the top editor
    QSA("#editor-tabs .tab").forEach(tab => tab.classList.remove("active"))
    QSA("#main-editor > .editor-tab-pane, #main-editor > .serial-term-pane").forEach(pane => pane.classList.remove("active"))

    currentTab++
    tabContainer.insertAdjacentHTML(
        'beforeend',
        `<div class="tab active" data-tab="${currentTab}" data-fn="${fn}"" draggable="true">
            <span class="tab-title">${fn}</span>
            <a class="menu-action" title="Close">
                <i class="fa-solid fa-xmark"></i>
            </a>
        </div>
        `
    )
    _addNewFileButton()
    terminal.insertAdjacentHTML(
        'beforebegin',
        `<div class="editor-tab-pane active" data-pane="${currentTab}"><div class="editor"></div></div>`
    )

    const editorTabElement = QS(`#editor-tabs [data-tab="${currentTab}"]`)
    editorTabElement.addEventListener("click", (_event) => {
        _activateTab(editorTabElement.dataset.tab)
    })
    const closeButton = editorTabElement.querySelector(".menu-action")

    function close_tab(event) {
        event.stopPropagation()
        _closeTab(editorTabElement.dataset.tab)
    }
    closeButton.addEventListener("click", close_tab)
    editorTabElement.addEventListener("auxclick", close_tab)

    const editorTabTitle = editorTabElement.querySelector(".tab-title")
    editorTabTitle.textContent = fn.split("/").pop()
    editorTabElement.dataset.fn = fn
    if (fn == "Untitled") {
        editorTabElement.classList.add("changed")
    }

    _setupDraggable(editorTabElement, 'editor')

    const editorElement = QS(`.editor-tab-pane[data-pane="${currentTab}"] .editor`)
    _activateTab(editorTabElement.dataset.tab)
    return editorElement
}


/**Event Listeners **/

document.addEventListener("fileRemoved", (event) => {
    const tab = QS(`#editor-tabs [data-fn="${event.detail.path}"]`)
    if (tab) {
        _closeTab(tab.dataset.tab)
    }
})

document.addEventListener("dirRemoved", (event) => {
    QSA(`#editor-tabs [data-fn^="${event.detail.path}/"]`).forEach((tab) => {
        _closeTab(tab.dataset.tab)
    })
})

document.addEventListener("fileRenamed", (event) => {
    const editorTab = QS(`#editor-tabs [data-fn="${event.detail.old}"]`)
    editorTab.dataset.fn = event.detail.new
    editorTab.querySelector(".tab-title").textContent = event.detail.new.split("/").pop()
})

document.addEventListener("fileSaved", (event) => {
    const editorTab = QS(`#editor-tabs [data-fn="${event.detail.fn}"] .tab-title`)
    editorTab.classList.remove("changed")
})

document.addEventListener("editorLoaded", (event) => {
    const editorTab = QS(`#editor-tabs [data-fn="${event.detail.fn}"] .tab-title`)
    addUpdateHandler(event.detail.editor, (update) => {
        if (update.docChanged) {
            editorTab.classList.add("changed")
        }
    })
})

document.addEventListener("deviceConnected", (_event) => {
    connected = true
    _addNewFileButton()
})


/** Helper Functions **/

function _closeTab(index) {
    const tabElement = QS(`#editor-tabs .tab[data-tab="${index}"]`)
        || QS(`#terminal-tabs .tab[data-tab="${index}"]`)
    if (!tabElement) return
    const titleElement = tabElement.querySelector(".tab-title")
    const tabSelected = tabElement.classList.contains("active")
    const editorElement = QS(`.editor-tab-pane[data-pane="${index}"]`)
    const fn = tabElement.dataset.fn

    if (titleElement.classList.contains("changed")) {
        if (!confirm(`${fn} has unsaved changes. Close without saving?`)) {
            return
        }
    }

    let nextSelectedTab = tabElement.nextElementSibling
    if (!nextSelectedTab || nextSelectedTab.dataset.new || nextSelectedTab.dataset.newMenu) {
        nextSelectedTab = tabElement.previousElementSibling
    }
    tabElement.remove()
    if (editorElement) editorElement.remove()

    document.dispatchEvent(new CustomEvent("tabClosed", {detail: {fn: fn, editorElement: editorElement}}))

    if (!tabSelected) {
        return
    }

    if (nextSelectedTab && nextSelectedTab.dataset.tab) {
        _activateTab(nextSelectedTab.dataset.tab)
    } else {
        createTab("Untitled", "")
        _activateTab(currentTab)
    }
}


function _activateTab(index) {
    // Tab may now be in either the editor tabs bar or the terminal tabs bar
    const tabElement = QS(`#editor-tabs .tab[data-tab="${index}"]`)
        || QS(`#terminal-tabs .tab[data-tab="${index}"]`)
    const editorElement = QS(`.editor-tab-pane[data-pane="${index}"]`)

    if (!tabElement || !editorElement) return

    // Which region is this tab in?
    const isTerminalRegion = tabElement.closest('#terminal-tabs') !== null;

    if (isTerminalRegion) {
        // Deactivate other tabs in the bottom region
        QSA("#terminal-tabs .tab").forEach(tab => tab.classList.remove("active"))
        QSA("#terminal-container > .editor-tab-pane, #terminal-container > .serial-term-pane, #terminal-container > .tab-content").forEach(pane => pane.classList.remove("active"))
    } else {
        // Deactivate other tabs in the top region
        QSA("#editor-tabs .tab").forEach(tab => tab.classList.remove("active"))
        QSA("#main-editor > .editor-tab-pane, #main-editor > .serial-term-pane").forEach(pane => pane.classList.remove("active"))
    }

    tabElement.classList.add("active")
    editorElement.classList.add("active")
    const fn = tabElement.dataset.fn

    document.dispatchEvent(new CustomEvent("tabActivated", {detail: {fn: fn, editorElement: editorElement}}))
}


// ─── + New Tab popup menu ─────────────────────────────────────────────────────

function _addNewFileButton() {
    const editorTabs = QID("editor-tabs")

    // Remove old button wrapper if present
    const existing = QS("[data-new-menu='new']")
    if (existing) existing.remove()
    // Remove any lingering body-level menu
    const existingMenu = QID('new-tab-menu-body')
    if (existingMenu) existingMenu.remove()

    // Build just the + button inside the tab bar
    const wrapper = document.createElement('div')
    wrapper.dataset.newMenu = 'new'
    wrapper.className = 'new-tab-wrapper'
    wrapper.innerHTML = `<a class="tab new-tab-btn" title="New tab" id="new-tab-plus-btn">+</a>`
    editorTabs.appendChild(wrapper)

    // Build the menu and attach it to document.body so it floats above everything
    const menu = document.createElement('div')
    menu.id = 'new-tab-menu-body'
    menu.className = 'new-tab-menu'
    menu.hidden = true
    menu.innerHTML = `
        <a class="new-tab-menu-item" id="ntm-terminal" href="#"><i class="fa-solid fa-terminal fa-fw"></i> Terminal</a>
        <a class="new-tab-menu-item ${connected ? '' : 'ntm-disabled'}" id="ntm-file" href="#"><i class="fa-solid fa-file fa-fw"></i> File</a>
        <a class="new-tab-menu-item ${connected ? '' : 'ntm-disabled'}" id="ntm-image" href="#"><i class="fa-solid fa-image fa-fw"></i> Image</a>
    `
    document.body.appendChild(menu)

    const plusBtn = wrapper.querySelector('#new-tab-plus-btn')

    function openMenu() {
        // Update disabled state each time
        menu.querySelector('#ntm-file').className  = `new-tab-menu-item ${connected ? '' : 'ntm-disabled'}`
        menu.querySelector('#ntm-image').className = `new-tab-menu-item ${connected ? '' : 'ntm-disabled'}`

        // Position menu below the + button
        const rect = plusBtn.getBoundingClientRect()
        menu.style.position = 'fixed'
        menu.style.top  = rect.bottom + 'px'
        menu.style.left = rect.left   + 'px'
        menu.hidden = false

        setTimeout(() => document.addEventListener('click', closeOnOutside, { capture: true, once: true }), 0)
    }

    function closeMenu() {
        menu.hidden = true
    }

    function closeOnOutside(e) {
        if (!menu.contains(e.target) && e.target !== plusBtn) closeMenu()
    }

    plusBtn.addEventListener('click', (e) => {
        e.preventDefault()
        if (menu.hidden) openMenu(); else closeMenu()
    })

    menu.querySelector('#ntm-terminal').addEventListener('click', (e) => {
        e.preventDefault()
        closeMenu()
        window.app?.createNewTerminalTab?.()
    })

    menu.querySelector('#ntm-file').addEventListener('click', (e) => {
        e.preventDefault()
        closeMenu()
        if (!connected) return
        window.app?.createNewFile?.('/')
    })

    menu.querySelector('#ntm-image').addEventListener('click', (e) => {
        e.preventDefault()
        closeMenu()
        window.app?.createNewOledBitmap?.()
    })
}


// ─── Drag-between-panels ──────────────────────────────────────────────────────

/**
 * Wire up HTML drag-and-drop on a regular (non-pinned) editor tab.
 * @param {HTMLElement} tabEl
 * @param {'editor'|'terminal'} origin - which panel bar owns this tab
 */
function _setupDraggable(tabEl, origin) {
    tabEl.addEventListener('dragstart', (e) => {
        const paneEl = QS(`.editor-tab-pane[data-pane="${tabEl.dataset.tab}"]`)
        _dragState = { tabEl, paneEl, origin }
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', tabEl.dataset.tab)
        tabEl.classList.add('tab-dragging')
    })

    tabEl.addEventListener('dragend', () => {
        tabEl.classList.remove('tab-dragging')
        _dragState = null
    })
}

/**
 * Make a tab-bar container accept drops of draggable tabs.
 * @param {HTMLElement} barEl  - the tabs bar (editor-tabs or terminal-tabs inner div)
 * @param {'editor'|'terminal'} target
 */
function _setupDropTarget(barEl, target) {
    barEl.addEventListener('dragover', (e) => {
        if (!_dragState) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        barEl.classList.add('tab-drag-over')
    })

    barEl.addEventListener('dragleave', (e) => {
        if (!barEl.contains(e.relatedTarget)) {
            barEl.classList.remove('tab-drag-over')
        }
    })

    barEl.addEventListener('drop', (e) => {
        e.preventDefault()
        barEl.classList.remove('tab-drag-over')
        if (!_dragState) return
        const { tabEl, paneEl, origin } = _dragState
        if (origin === target) return   // dropped in same panel — no-op

        // Move tab button into the new bar (before the + button wrapper if present)
        const plusWrapper = barEl.querySelector('[data-new-menu]')
        if (plusWrapper) {
            barEl.insertBefore(tabEl, plusWrapper)
        } else {
            barEl.appendChild(tabEl)
        }

        // Move pane to the correct region
        if (target === 'terminal') {
            // Pane should live inside #terminal-container  (before #xterm div)
            const xtermDiv = QID('xterm')
            xtermDiv.parentElement.insertBefore(paneEl, xtermDiv)
            // Tab panes in terminal need the terminal-region-pane class for flex sizing
            paneEl.classList.add('terminal-region-pane')
        } else {
            // Pane should live in #main-editor (before #terminal-container)
            const termContainer = QID('terminal-container')
            termContainer.parentElement.insertBefore(paneEl, termContainer)
            paneEl.classList.remove('terminal-region-pane')
        }

        _dragState = null
        _activateTab(tabEl.dataset.tab)
    })
}

// Wire up drop targets and the + button once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const editorTabsBar   = QID('editor-tabs')
    const terminalTabsBar = QS('#terminal-tabs > div:first-child')

    if (editorTabsBar)   _setupDropTarget(editorTabsBar,   'editor')
    if (terminalTabsBar) _setupDropTarget(terminalTabsBar, 'terminal')

    // Always show the + button from the start (not gated on device connection)
    _addNewFileButton()
})
