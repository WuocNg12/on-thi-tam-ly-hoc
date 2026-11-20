(function(){
    'use strict';
    const chapters = window.PSY_THEORY;
    const selector = document.getElementById('chapter-select');
    const search = document.getElementById('theory-search');
    const list = document.getElementById('theory-list');
    const podcast = document.getElementById('podcast');
    const audio = document.getElementById('podcast-audio');
    const rate = document.getElementById('podcast-rate');
    const continuous = document.getElementById('podcast-continuous');
    const startPodcast = document.getElementById('podcast-start');
    const message = document.getElementById('podcast-message');
    let episodeNumber = 0;
    let progressKey = '';
    let lastSavedSecond = -1;
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
    function saveListeningPosition() {
        if (!progressKey || !audio.duration || audio.readyState < 1) return;
        const second = audio.ended ? 0 : Math.floor(audio.currentTime);
        try { localStorage.setItem(progressKey, String(second)); } catch (_) {}
        lastSavedSecond = second;
    }
    function playEpisode() {
        audio.play().catch(error => {
            if (error.name === 'AbortError') return;
            message.textContent = error.name === 'NotAllowedError'
                ? 'Nhấn nút phát để nghe tiếp.'
                : 'Trình duyệt chưa phát được tập này. Bạn có thể mở tệp qua liên kết Tải MP3.';
        });
    }
    function playChapter(number) {
        selector.value = String(number);
        selector.onchange();
        playEpisode();
    }
    function updatePodcast() {
        const number = Number(selector.value);
        const ep = window.PSY_PODCASTS[number - 1];
        const newKey = ep ? lsKey('podcast_time_' + number) : '';
        podcast.hidden = !ep;
        startPodcast.hidden = !!ep;
        continuous.checked = lsGet('podcast_continuous', true);
        rate.value = String(lsGet('podcast_rate', 1));
        if (rate.selectedIndex < 0) rate.value = '1';
        if (ep && episodeNumber === number && progressKey === newKey) return;
        saveListeningPosition();
        audio.pause();
        progressKey = '';
        episodeNumber = 0;
        if (!ep) {
            if (audio.hasAttribute('src')) { audio.removeAttribute('src'); audio.load(); }
            return;
        }
        episodeNumber = number;
        progressKey = newKey;
        lastSavedSecond = -1;
        const title = chapters[number].title;
        const file = 'audio/bai-' + String(number).padStart(2, '0') + '.mp3';
        document.getElementById('podcast-title').textContent = 'Podcast · Bài ' + number;
        const pages = chapters[number].sections.flatMap(s => s.pages);
        const pageRange = [...new Set([Math.min(...pages), Math.max(...pages)])].join('–');
        const minutes = Math.floor(ep.duration / 60);
        const seconds = String(Math.floor(ep.duration % 60)).padStart(2, '0');
        document.getElementById('podcast-meta').textContent = minutes + ':' + seconds + ' · Trang ' + pageRange + ' PDF · Giọng đọc tổng hợp';
        const download = document.getElementById('podcast-download');
        download.href = file;
        download.setAttribute('aria-label', 'Tải MP3 ' + title);
        const transcript = document.getElementById('podcast-transcript');
        transcript.replaceChildren(...ep.transcript.map(line => element('p', line)));
        document.getElementById('podcast-script').open = false;
        message.textContent = '';
        audio.src = file;
        audio.defaultPlaybackRate = Number(rate.value);
        audio.playbackRate = Number(rate.value);
    }
    audio.addEventListener('loadedmetadata', () => {
        if (!progressKey) return;
        let saved = 0;
        try { saved = Number(localStorage.getItem(progressKey)); } catch (_) {}
        audio.currentTime = saved > 0 && saved < audio.duration - 1 ? saved : 0;
        audio.playbackRate = Number(rate.value);
    });
    audio.addEventListener('timeupdate', () => {
        if (!audio.paused && Math.abs(Math.floor(audio.currentTime) - lastSavedSecond) >= 5) saveListeningPosition();
    });
    audio.addEventListener('pause', saveListeningPosition);
    audio.addEventListener('ended', () => {
        saveListeningPosition();
        if (continuous.checked && episodeNumber < window.PSY_PODCASTS.length) playChapter(episodeNumber + 1);
    });
    audio.addEventListener('error', () => {
        if (episodeNumber) message.textContent = 'Chưa tải được âm thanh. Kiểm tra kết nối hoặc chọn Tải MP3.';
    });
    rate.onchange = () => {
        audio.playbackRate = Number(rate.value);
        lsSet('podcast_rate', audio.playbackRate);
    };
    continuous.onchange = () => lsSet('podcast_continuous', continuous.checked);
    startPodcast.onclick = () => playChapter(1);
    window.addEventListener('pagehide', saveListeningPosition);
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
        if (/^#podcast(?:-[1-9])?$/.test(location.hash)) {
            const hash = window.PSY_PODCASTS[Number(selector.value) - 1] ? '#podcast-' + selector.value : '';
            history.replaceState(null, '', location.pathname + location.search + hash);
        }
        search.value = '';
        updatePodcast();
        render();
    };
    search.addEventListener('input', render);
    window.theoryReader = {close() {
        saveListeningPosition();
        audio.pause();
    }, open(requestedChapter) {
        selector.value = String(requestedChapter ?? lsGet('theory_chapter', 0));
        if (selector.selectedIndex < 0) selector.selectedIndex = 0;
        if (requestedChapter !== undefined) lsSet('theory_chapter', selector.value);
        updatePodcast();
        render();
    }};
})();
