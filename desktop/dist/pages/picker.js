"use strict";
const sourceList = document.getElementById("sources");
const shareButton = document.getElementById("share");
const cancelButton = document.getElementById("cancel");
const audioRow = document.getElementById("audio-row");
const audioBox = document.getElementById("audio");
const tabs = [...document.querySelectorAll("[role=tab]")];
let allSources = [];
let selected = null;
let kind = "screen";
audioRow.hidden = new URLSearchParams(location.search).get("audio") !== "1";
function select(id) {
    selected = id;
    shareButton.disabled = false;
    for (const item of sourceList.querySelectorAll(".source"))
        item.setAttribute("aria-selected", String(item.dataset.id === id));
}
function renderSources() {
    sourceList.replaceChildren();
    const visible = allSources.filter((source) => source.kind === kind);
    for (const source of visible) {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "source";
        button.dataset.id = source.id;
        button.setAttribute("aria-selected", String(source.id === selected));
        const preview = document.createElement("span");
        preview.className = "preview";
        if (source.thumbnail) {
            const image = document.createElement("img");
            image.src = source.thumbnail;
            image.alt = "";
            preview.append(image);
        }
        const label = document.createElement("span");
        label.className = "label";
        if (source.icon) {
            const icon = document.createElement("img");
            icon.src = source.icon;
            icon.alt = "";
            label.append(icon);
        }
        const name = document.createElement("span");
        name.textContent = source.name;
        label.append(name);
        button.append(preview, label);
        button.addEventListener("click", () => select(source.id));
        button.addEventListener("dblclick", () => {
            select(source.id);
            share();
        });
        item.append(button);
        sourceList.append(item);
    }
    if (!visible.length) {
        const empty = document.createElement("li");
        empty.className = "empty";
        empty.textContent = kind === "screen" ? "No screens found." : "No windows found.";
        sourceList.append(empty);
    }
}
function share() {
    if (selected)
        window.librecord.chooseScreenSource(selected, !audioRow.hidden && audioBox.checked);
}
for (const tab of tabs) {
    tab.addEventListener("click", () => {
        kind = tab.dataset.kind === "window" ? "window" : "screen";
        for (const other of tabs)
            other.setAttribute("aria-selected", String(other === tab));
        renderSources();
    });
}
shareButton.addEventListener("click", share);
cancelButton.addEventListener("click", () => window.librecord.chooseScreenSource(null, false));
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape")
        window.librecord.chooseScreenSource(null, false);
    if (event.key === "Enter")
        share();
});
window.librecord.screenSources().then((sources) => {
    allSources = sources;
    const firstScreen = sources.find((source) => source.kind === "screen");
    if (firstScreen)
        select(firstScreen.id);
    renderSources();
});
