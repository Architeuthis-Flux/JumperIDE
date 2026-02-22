import { QID } from './utils.js'

/** Default doc sites shown in the docs sidebar (name + url). */
const DEFAULT_CUSTOM_DOC_SITES = [
    { name: 'MicroPython', url: 'https://docs.micropython.org/en/latest/library/index.html#python-standard-libraries-and-micro-libraries' },
    { name: 'Jumperless API', url: 'https://docs.jumperless.org/09.5-micropythonAPIreference/' }
]

const settingsElement = QID("menu-settings")
let callbacks = new Map()
let settings = _loadSettings()

/**
 * @param {string} setting The name of the setting to query
 * @returns {*} Returns the value of the setting if found, else undefined
 */
export function getSetting(setting) {
    return settings[setting]
}

/**
 * @returns {{ name: string, url: string }[]} List of custom doc sites
 */
export function getCustomDocSites() {
    const sites = settings.customDocSites
    if (!Array.isArray(sites) || sites.length === 0) return DEFAULT_CUSTOM_DOC_SITES.slice()
    return sites.map(s => ({ name: String(s?.name ?? ''), url: String(s?.url ?? '') }))
}

/**
 * @param {{ name: string, url: string }[]} sites New list of custom doc sites
 */
export function setCustomDocSites(sites) {
    if (!Array.isArray(sites)) return
    settings.customDocSites = sites.map(s => ({ name: String(s?.name ?? ''), url: String(s?.url ?? '') }))
    _persistSettings(settings)
    _notify('customDocSites', settings.customDocSites)
}

/**
 * @returns {number} Index of the currently selected doc site
 */
export function getSelectedDocIndex() {
    const idx = settings.selectedDocIndex
    const n = (settings.customDocSites || DEFAULT_CUSTOM_DOC_SITES).length
    if (typeof idx !== 'number' || idx < 0 || idx >= n) return n >= 2 ? 1 : 0
    return idx
}

/**
 * @param {number} index Index of the doc site to select
 */
export function setSelectedDocIndex(index) {
    const n = (settings.customDocSites || DEFAULT_CUSTOM_DOC_SITES).length
    const i = Math.max(0, Math.min(index, n - 1))
    if (settings.selectedDocIndex === i) return
    settings.selectedDocIndex = i
    _persistSettings(settings)
    _notify('selectedDocIndex', i)
}


/**
 *
 * @param {string} setting The name of the setting to update
 * @param {string|boolean} newValue The new value to set the setting to (string for dropdowns, boolean for checkboxes)
 */
export function updateSetting(setting, newValue) {
    // set the DOM
    const settingElement = settingsElement.querySelector(`#${setting}`)
    if (settingElement.tagName == "SELECT") {
        settingElement.value = newValue
    } else if (settingElement.type == "checkbox") {
        settingElement.checked = newValue
    } else {
        console.error(`Element is not <select> or <input type="checkbox">: ${settingElement}`)
    }

    // set our local cache
    settings[setting] = newValue

    // inform any subscribers
    _notify(setting, newValue)

    // persist to local storage
    _persistSettings(settings)
}


/**
 *
 * @param {string} setting The name of the setting to set a callback for
 * @param {function(string):void} callback A callback function that will receive the new value of the setting
 */
export function onSettingChange(setting, callback) {
    if (!callbacks.has(setting)) {
        callbacks.set(setting, [])
    }
    callbacks.get(setting).push(callback)
}


settingsElement.addEventListener("change", (event) => {
    settings = _persistSettings()
    _notify(event.target.id, settings[event.target.id])
})


function _loadSettings() {
    // get settings from either localstorage or read from the DOM (and populate local storage)
    let loadedSettings = JSON.parse(localStorage.getItem("settings"))
    if (!loadedSettings) {
        _persistSettings()
        loadedSettings = JSON.parse(localStorage.getItem("settings"))
    }

    function _setLoadedValue(setting, loadedValue, domValue, setter) {
        // if we loaded nothing, then don't try to set the DOM (perhaps a brand new setting and
        // therefore should use the default)
        if (loadedValue != undefined) {
            // set the loaded value to the DOM
            setter(loadedValue)
        } else {
            loadedSettings[setting] = domValue
            loadedValue = domValue
        }

        // notify any code that might need to know about what we loaded
        _notify(setting, loadedValue)
    }

    // loop over all DOM settings elements and load them with the value from local storage
    settingsElement.querySelectorAll("input[type='checkbox']").forEach(element => {
        _setLoadedValue(element.id, loadedSettings[element.id], element.checked, (value) => element.checked = value)
    })
    settingsElement.querySelectorAll("select").forEach(element => {
        _setLoadedValue(element.id, loadedSettings[element.id], element.value, (value) => element.value = value)
    })

    // Custom doc sites (not in DOM): ensure defaults and persist so they survive next DOM-only persist
    if (!Array.isArray(loadedSettings.customDocSites) || loadedSettings.customDocSites.length === 0) {
        loadedSettings.customDocSites = DEFAULT_CUSTOM_DOC_SITES.slice()
        if (typeof loadedSettings.selectedDocIndex !== 'number' || loadedSettings.selectedDocIndex < 0) {
            loadedSettings.selectedDocIndex = 1
        }
        _persistSettings(loadedSettings)
    } else if (typeof loadedSettings.selectedDocIndex !== 'number' || loadedSettings.selectedDocIndex < 0) {
        loadedSettings.selectedDocIndex = 1
    }

    return loadedSettings
}


function _persistSettings(newSettings = undefined) {
    if (!newSettings) {
        // nothing passed into us, so lets read from the DOM and persist that
        newSettings = new Object()
        settingsElement.querySelectorAll("input[type='checkbox']").forEach(element => {
            newSettings[element.id] = element.checked
        })
        settingsElement.querySelectorAll("select").forEach(element => {
            newSettings[element.id] = element.value
        })
        // preserve custom doc sites and selected index (not in DOM); never reference `settings` here
        // because _persistSettings() can be called from _loadSettings() before `settings` is initialized
        let source
        try {
            source = JSON.parse(localStorage.getItem('settings'))
        } catch (_) {
            source = null
        }
        if (Array.isArray(source?.customDocSites)) newSettings.customDocSites = source.customDocSites
        if (typeof source?.selectedDocIndex === 'number') newSettings.selectedDocIndex = source.selectedDocIndex
    }

    localStorage.setItem("settings", JSON.stringify(newSettings))
    return newSettings
}


function _notify(setting, newValue) {
    // If there are any callbacks for this setting update, then let's call them
    if (callbacks.has(setting)) {
        for (let callback of callbacks.get(setting)) {
            callback(newValue)
        }
    }
}
