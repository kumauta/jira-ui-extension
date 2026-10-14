(() => {
  "use strict";

  const panelSelector = '#issue-activity-feed-tabpanel[aria-labelledby="issue-activity-feed-tabpanel-tab-Comments"]';
  const buttonSelector = 'button[data-testid="issue.activity.common.component.load-more-button.loading-button"]';
  const labels = new Set(["他のコメントを表示", "Show more comments", "Load more comments"]);
  const retryDelay = 1500;
  // Stop retrying if Jira fails to load a page; do not generate endless requests.
  let lastProgress = "";
  let attempts = 0;
  let lastClick = 0;
  let timer;

  function expand() {
    timer = undefined;
    const panel = document.querySelector(panelSelector);
    if (!panel) return;
    const button = panel.querySelector(buttonSelector);
    if (!button || !labels.has(button.textContent.replace(/\s+/g, " ").trim())) return;
    if (button.disabled || button.getAttribute("aria-disabled") === "true" ||
        button.getAttribute("aria-busy") === "true" || button.getClientRects().length === 0) return;

    const count = panel.querySelectorAll('[data-testid="issue.activity.comments-list"] > ul > li').length;
    const progress = `${location.href}|${count}`;
    if (progress !== lastProgress) {
      lastProgress = progress;
      attempts = 0;
    }
    if (attempts >= 3) return;
    const remaining = retryDelay - (Date.now() - lastClick);
    if (remaining > 0) {
      schedule(remaining);
      return;
    }
    attempts += 1;
    lastClick = Date.now();
    button.click();
    schedule(retryDelay);
  }

  function schedule(delay = 100) {
    if (timer === undefined) timer = setTimeout(expand, delay);
  }

  const observer = new MutationObserver(() => schedule());
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["disabled", "aria-disabled", "aria-busy", "aria-labelledby", "hidden", "style", "class"],
  });
  window.addEventListener("popstate", () => schedule());
  schedule(0);
})();
