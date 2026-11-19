(function(){
    'use strict';
    const chapters = window.PSY_THEORY;
    const selector = document.getElementById('chapter-select');
    const search = document.getElementById('theory-search');
    const list = document.getElementById('theory-list');
    const chapterCount = chapters.reduce((sum, c) => sum + c.sections.length, 0);
    const pdf = document.getElementById('pdf-full').href;
    const normalized = value => value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/\s+/g, ' ').trim();
    function element(tag, text, className) {
        const el = document.createElement(tag);
        if (text) el.textContent = text;
        if (className) el.className = className;
        return el;
    }
    chapters.forEach((chapter, i) => selector.append(new Option(chapter.title, String(i))));
    function updateProgress(learned) {
        document.getElementById('theory-progress').textContent = `Đã ôn ${learned.size} / ${chapterCount} mục`;
    }
    function render() {
        const term = normalized(search.value);
        const done = new Set(lsGet('theory_done', []));
        updateProgress(done);
        list.replaceChildren();
        chapters.forEach((chapter, i) => {
            if (!term && i !== Number(selector.value)) return;
            const group = element('section');
            const groupTitle = element('h3', chapter.title);
            group.append(groupTitle);
            chapter.sections.forEach((section, j) => {
                const searchable = [chapter.title, section.title, section.text, section.prompt, section.answer, section.sourceNote].join(' ');
                if (term && !normalized(searchable).includes(term)) return;
                const id = `${i}/${j}`;
                const card = element('details', '', 'theory-section');
                card.open = !term && j === 0;
                const summary = element('summary');
                const title = element('span', section.title);
                const pageLabel = 'Trang ' + (section.pages.length === 1 ? section.pages[0] : `${section.pages[0]}–${section.pages.at(-1)}`);
                const status = element('span', done.has(id) ? 'Đã ôn' : pageLabel, 'section-status');
                summary.append(title, status);
                card.append(summary);
                const content = element('div', '', 'reading');
                section.text.split(/\n\s*\n/).forEach(text => content.append(element('p', text)));
                if (section.sourceNote) content.append(element('p', section.sourceNote, 'source-note'));
                const pageLink = element('a', `${pageLabel} trong PDF gốc`, 'source-link');
                pageLink.href = pdf + '#page=' + section.pages[0];
                pageLink.target = '_blank';
                pageLink.rel = 'noopener';
                content.append(pageLink);
                const recall = element('div', '', 'recall');
                recall.append(element('div', 'Tự kiểm tra', 'recall-label'), element('p', section.prompt));
                const reveal = element('details');
                reveal.append(element('summary', 'Xem đáp án'), element('p', section.answer));
                recall.append(reveal);
                const label = element('label', '', 'mark-read');
                const check = element('input');
                check.type = 'checkbox';
                check.checked = done.has(id);
                check.onchange = () => {
                    if (check.checked) done.add(id);
                    else done.delete(id);
                    lsSet('theory_done', [...done]);
                    status.textContent = check.checked ? 'Đã ôn' : pageLabel;
                    updateProgress(done);
                };
                label.append(check, document.createTextNode('Đánh dấu đã ôn'));
                content.append(recall, label);
                card.append(content);
                group.append(card);
            });
            if (group.children.length > 1) list.append(group);
        });
        if (!list.children.length) list.append(element('p', 'Không tìm thấy mục phù hợp. Hãy thử từ khóa khác.', 'empty-state'));
    }
    selector.onchange = () => {
        lsSet('theory_chapter', selector.value);
        search.value = '';
        render();
    };
    search.addEventListener('input', render);
    window.theoryReader = {open() {
        selector.value = String(lsGet('theory_chapter', 0));
        if (selector.selectedIndex < 0) selector.selectedIndex = 0;
        render();
    }};
})();
