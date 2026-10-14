(() => {
  "use strict";

  const navId = "jira-ui-comments-nav";
  const panelSelector = '#issue-activity-feed-tabpanel[aria-labelledby="issue-activity-feed-tabpanel-tab-Comments"]';
  const columnSelector = '[data-testid="issue.views.issue-details.issue-layout.right-most-column"]';
  const itemSelector = '[data-testid="issue.activity.comments-list"] > ul > li';
  const titleCache = new WeakMap();
  let timer;
  let signature = "";
  let nav;

  function commentTitle(body) {
    const source = body.textContent;
    const cached = titleCache.get(body);
    if (cached?.source === source) return cached.title;

    // Media renderers contain filenames and accessible controls, not comment text.
    const copy = body.cloneNode(true);
    copy.querySelectorAll('[data-node-type="mediaSingle"], [data-node-type="mediaGroup"], [data-node-type="media"], button, [role="button"], [aria-hidden="true"], [data-testid="visually-hidden-heading-anchor"], .linenumber')
      .forEach(element => element.remove());
    copy.querySelectorAll("br").forEach(element => element.replaceWith("\n"));
    copy.querySelectorAll("p, h1, h2, h3, h4, h5, h6, div, li, pre, blockquote, tr")
      .forEach(element => { element.prepend("\n"); element.append("\n"); });
    const firstLine = copy.textContent.split(/\r?\n/).map(line => line.trim()).find(Boolean);
    const hasImage = body.querySelector('img, [data-file-mime-type^="image/"]');
    const title = firstLine || (hasImage ? "画像のみ" : "コメント");
    titleCache.set(body, { source, title });
    return title;
  }

  function link(entry, label, className) {
    const anchor = document.createElement("a");
    anchor.href = `#${entry.anchor}`;
    anchor.className = className;
    anchor.textContent = label;
    anchor.title = label;
    anchor.addEventListener("click", event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = document.getElementById(entry.anchor);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ block: "start", behavior: "instant" });
      target.focus({ preventScroll: true });
    });
    return anchor;
  }

  function update() {
    timer = undefined;
    const column = document.querySelector(columnSelector);
    const panel = document.querySelector(panelSelector);
    if (!column || !panel) {
      nav?.remove();
      nav = undefined;
      signature = "";
      return;
    }

    const entries = Array.from(panel.querySelectorAll(itemSelector)).flatMap(item => {
      const target = item.querySelector('[data-testid^="comment-base-item-"]');
      const body = target?.querySelector(".ak-renderer-document");
      if (!body) return [];
      const id = target.getAttribute("data-testid").slice("comment-base-item-".length);
      const anchor = target.id || `jira-ui-comment-${id}`;
      if (!target.id) target.id = anchor;
      return [{ anchor, title: commentTitle(body) }];
    });
    const nextSignature = JSON.stringify([location.pathname, location.search, entries]);
    if (nav?.isConnected && nav.parentElement === column && signature === nextSignature) return;

    if (!nav?.isConnected || nav.parentElement !== column) {
      nav?.remove();
      nav = document.createElement("nav");
      nav.id = navId;
      nav.setAttribute("aria-label", "コメントへの移動");
      column.append(nav);
    }
    signature = nextSignature;
    const heading = document.createElement("h2");
    heading.className = "jira-ui-comments-heading";
    heading.textContent = `コメント (${entries.length})`;
    nav.replaceChildren(heading);
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "jira-ui-comments-empty";
      empty.textContent = "コメントはありません";
      nav.append(empty);
      return;
    }

    nav.append(link(entries[0], "最初のコメントへ", "jira-ui-comments-jump"));
    const list = document.createElement("ol");
    list.className = "jira-ui-comments-list";
    entries.forEach((entry, index) => {
      const row = document.createElement("li");
      const anchor = link(entry, entry.title, "jira-ui-comments-link");
      const number = document.createElement("span");
      number.className = "jira-ui-comments-number";
      number.setAttribute("aria-hidden", "true");
      number.textContent = String(index + 1);
      const title = document.createElement("span");
      title.className = "jira-ui-comments-title";
      title.textContent = entry.title;
      anchor.replaceChildren(number, title);
      row.append(anchor);
      list.append(row);
    });
    nav.append(list, link(entries.at(-1), "最後のコメントへ", "jira-ui-comments-jump"));
  }

  function schedule() {
    if (timer === undefined) timer = setTimeout(update, 100);
  }

  const observer = new MutationObserver(records => {
    // Avoid reacting to the navigation's own rendering.
    if (records.some(record => !nav?.contains(record.target))) schedule();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["aria-labelledby"],
  });
  window.addEventListener("popstate", schedule);
  schedule();
})();
