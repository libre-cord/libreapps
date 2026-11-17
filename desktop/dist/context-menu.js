"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildContextMenu = buildContextMenu;
const electron_1 = require("electron");
function buildContextMenu(contents, params) {
    const items = [];
    if (params.misspelledWord) {
        for (const suggestion of params.dictionarySuggestions.slice(0, 5))
            items.push({ label: suggestion, click: () => contents.replaceMisspelling(suggestion) });
        if (!params.dictionarySuggestions.length)
            items.push({ label: "No suggestions", enabled: false });
        items.push({ label: "Add to Dictionary", click: () => contents.session.addWordToSpellCheckerDictionary(params.misspelledWord) }, { type: "separator" });
    }
    if (params.linkURL && /^https?:/i.test(params.linkURL)) {
        items.push({ label: "Open Link in Browser", click: () => electron_1.shell.openExternal(params.linkURL) }, { label: "Copy Link", click: () => electron_1.clipboard.writeText(params.linkURL) }, { type: "separator" });
    }
    if (params.mediaType === "image" && params.srcURL) {
        items.push({ label: "Copy Image", click: () => contents.copyImageAt(params.x, params.y) }, { label: "Save Image As…", click: () => contents.downloadURL(params.srcURL) }, { type: "separator" });
    }
    if (params.isEditable) {
        items.push({ role: "undo", enabled: params.editFlags.canUndo }, { role: "redo", enabled: params.editFlags.canRedo }, { type: "separator" }, { role: "cut", enabled: params.editFlags.canCut }, { role: "copy", enabled: params.editFlags.canCopy }, { role: "paste", enabled: params.editFlags.canPaste }, { role: "selectAll" });
    }
    else if (params.selectionText.trim()) {
        items.push({ role: "copy" });
    }
    while (items.at(-1)?.type === "separator")
        items.pop();
    return items.length ? electron_1.Menu.buildFromTemplate(items) : null;
}
