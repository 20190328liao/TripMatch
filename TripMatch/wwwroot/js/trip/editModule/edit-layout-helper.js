// 匯出調整版面的函式
export function expandContainerToFullWidth() {
    const mainElement = document.querySelector("main");

    if (mainElement) {
        mainElement.style.padding = "0";
        mainElement.style.margin = "0";
        mainElement.style.maxWidth = "100%";

        const parentContainer = mainElement.closest(".container");
        if (parentContainer) {
            parentContainer.classList.remove("container");
            Object.assign(parentContainer.style, {
                maxWidth: "100%",
                padding: "0",
                margin: "0",
                width: "100%"
            });
        }
    }
}