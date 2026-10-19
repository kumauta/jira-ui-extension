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
  let collapsed = false;
  let observedSidebar;
  const resizeObserver = new ResizeObserver(() => schedule());

  function placement(panel, column) {
    const sidebar = column?.closest('[data-testid="issue.views.issue-details.issue-layout.container-right"]') || column;
    if (observedSidebar !== sidebar) {
      resizeObserver.disconnect();
      if (sidebar) resizeObserver.observe(sidebar);
      observedSidebar = sidebar;
    }
    const rect = sidebar?.getBoundingClientRect();
    if (sidebar?.checkVisibility({ visibilityProperty: true }) &&
        !sidebar.closest('[aria-hidden="true"]') && rect.width > 48 && rect.right > 0 && rect.left < innerWidth) {
      return { parent: column, mode: "sidebar" };
    }

    const editor = panel.querySelector('[data-testid="issue.activity.comment"]');
    if (!editor) return null;
    // Jira pins this wrapper to the bottom. Keep the navigator above the editor,
    // outside its avatar/text flex row, so the draft and its controls stay intact.
    for (let wrapper = editor.parentElement; wrapper && wrapper !== panel; wrapper = wrapper.parentElement) {
      if (getComputedStyle(wrapper).position === "sticky") {
        return { parent: wrapper, before: wrapper.firstElementChild, mode: "compact" };
      }
    }
    const row = editor.parentElement;
    return { parent: row.parentElement, before: row, mode: "compact" };
  }

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
    const destination = panel && placement(panel, column);
    if (!destination) {
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
    if (!nav) {
      nav = document.createElement("nav");
      nav.id = navId;
      nav.setAttribute("aria-label", "コメントへの移動");
    }
    nav.dataset.placement = destination.mode;
    if (nav.parentElement !== destination.parent ||
        (destination.before && destination.before !== nav && nav.nextElementSibling !== destination.before)) {
      destination.parent.insertBefore(nav, destination.before || null);
    }
    if (signature === nextSignature && nav.childElementCount) return;
    signature = nextSignature;
    const header = document.createElement("div");
    header.className = "jira-ui-comments-header";
    const heading = document.createElement("h2");
    heading.className = "jira-ui-comments-heading";
    heading.textContent = `コメント (${entries.length})`;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "jira-ui-comments-toggle";
    toggle.setAttribute("aria-controls", "jira-ui-comments-content");
    const content = document.createElement("div");
    content.id = "jira-ui-comments-content";
    function syncCollapsed() {
      content.hidden = collapsed;
      toggle.setAttribute("aria-expanded", String(!collapsed));
      toggle.textContent = collapsed ? "展開" : "折りたたむ";
      toggle.setAttribute("aria-label", collapsed ? "コメント一覧を展開" : "コメント一覧を折りたたむ");
    }
    toggle.addEventListener("click", () => {
      collapsed = !collapsed;
      syncCollapsed();
    });
    syncCollapsed();
    header.append(heading, toggle);
    nav.replaceChildren(header, content);
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "jira-ui-comments-empty";
      empty.textContent = "コメントはありません";
      content.append(empty);
      return;
    }

    const jumps = document.createElement("div");
    jumps.className = "jira-ui-comments-jumps";
    const pageTop = document.createElement("a");
    pageTop.href = "#jira-page-layout-main";
    pageTop.className = "jira-ui-comments-jump";
    pageTop.textContent = "ページトップへ";
    pageTop.addEventListener("click", event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      // Jira scrolls the issue column independently of the browser window.
      for (let container = panel; container; container = container.parentElement) {
        container.scrollTo({ top: 0, behavior: "instant" });
      }
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    jumps.append(link(entries[0], "最初のコメントへ", "jira-ui-comments-jump"),
      pageTop,
      link(entries.at(-1), "最後のコメントへ", "jira-ui-comments-jump"));
    content.append(jumps);
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
    content.append(list);
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
    attributeFilter: ["aria-labelledby", "style", "class", "hidden", "aria-hidden"],
  });
  window.addEventListener("popstate", schedule);
  window.addEventListener("resize", schedule);
  schedule();
})();
