(function () {
  'use strict';

  function initGuideSearch() {
    var searchContainer = document.getElementById('guide-search');
    var input = document.getElementById('guide-search-input');
    var clearBtn = document.getElementById('guide-search-clear');
    var resultsList = document.getElementById('guide-search-results');
    var status = document.getElementById('guide-search-status');
    if (!input || !resultsList || !status) return;

    var chapters = [];
    var chapterElements = document.querySelectorAll('section.chapter');
    for (var i = 0; i < chapterElements.length; i++) {
      var el = chapterElements[i];
      var groupEl = el.closest('.guide-group');
      var groupTitle = groupEl ? (groupEl.querySelector('h2') ? groupEl.querySelector('h2').textContent.trim() : '') : '';
      var eyebrow = el.querySelector('.eyebrow') ? el.querySelector('.eyebrow').textContent.trim() : '';
      var titleEl = el.querySelector('h3');
      var title = titleEl ? titleEl.textContent.trim() : '';
      var introEl = el.querySelector('.intro');
      var intro = introEl ? introEl.textContent.trim() : '';

      var features = [];
      var featureDivs = el.querySelectorAll('.features > div');
      for (var f = 0; f < featureDivs.length; f++) {
        var dt = featureDivs[f].querySelector('dt');
        var dd = featureDivs[f].querySelector('dd');
        features.push({
          title: dt ? dt.textContent.trim() : '',
          text: dd ? dd.textContent.trim() : ''
        });
      }

      var steps = [];
      var stepLis = el.querySelectorAll('.steps li');
      for (var s = 0; s < stepLis.length; s++) {
        steps.push(stepLis[s].textContent.trim());
      }

      var notes = [];
      var noteEls = el.querySelectorAll('.note');
      for (var n = 0; n < noteEls.length; n++) {
        var noteH4 = noteEls[n].querySelector('h4');
        var noteP = noteEls[n].querySelector('p');
        notes.push({
          title: noteH4 ? noteH4.textContent.trim() : '',
          text: noteP ? noteP.textContent.trim() : ''
        });
      }

      var combined = [title, intro, groupTitle];
      for (var cf = 0; cf < features.length; cf++) {
        combined.push(features[cf].title);
        combined.push(features[cf].text);
      }
      for (var cs = 0; cs < steps.length; cs++) {
        combined.push(steps[cs]);
      }
      for (var cn = 0; cn < notes.length; cn++) {
        combined.push(notes[cn].title);
        combined.push(notes[cn].text);
      }

      chapters.push({
        id: el.id,
        element: el,
        number: eyebrow,
        title: title,
        intro: intro,
        groupTitle: groupTitle,
        features: features,
        steps: steps,
        notes: notes,
        searchText: combined.join(' ').toLowerCase()
      });
    }

    var toc = document.querySelector('.toc');
    var tocLinks = toc ? toc.querySelectorAll('a[href^="#"]') : [];
    var tocDetails = toc ? toc.querySelectorAll('.toc-group details') : [];

    var emptyText = input.getAttribute('data-empty-text') || 'Keine passenden Kapitel gefunden.';
    var countSuffix = input.getAttribute('data-count-text') || 'Treffer gefunden';

    function escapeHtml(str) {
      return String(str).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    function highlightText(text, tokens) {
      if (!text || !tokens.length) return escapeHtml(text || '');
      var escaped = escapeHtml(text);
      for (var t = 0; t < tokens.length; t++) {
        var token = tokens[t];
        if (!token) continue;
        var re = new RegExp('(' + token.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + ')', 'gi');
        escaped = escaped.replace(re, '<mark>$1</mark>');
      }
      return escaped;
    }

    function createSnippet(chapter, tokens) {
      // Find the most relevant place matching any token
      for (var f = 0; f < chapter.features.length; f++) {
        var feat = chapter.features[f];
        for (var t = 0; t < tokens.length; t++) {
          if (feat.title.toLowerCase().includes(tokens[t]) || feat.text.toLowerCase().includes(tokens[t])) {
            return highlightText(feat.title + ': ' + feat.text, tokens);
          }
        }
      }
      for (var s = 0; s < chapter.steps.length; s++) {
        var step = chapter.steps[s];
        for (var st = 0; st < tokens.length; st++) {
          if (step.toLowerCase().includes(tokens[st])) {
            return highlightText(step, tokens);
          }
        }
      }
      for (var n = 0; n < chapter.notes.length; n++) {
        var note = chapter.notes[n];
        for (var nt = 0; nt < tokens.length; nt++) {
          if (note.title.toLowerCase().includes(tokens[nt]) || note.text.toLowerCase().includes(tokens[nt])) {
            return highlightText(note.title + ': ' + note.text, tokens);
          }
        }
      }
      return highlightText(chapter.intro, tokens);
    }

    function resetToc() {
      for (var i = 0; i < tocLinks.length; i++) {
        tocLinks[i].classList.remove('toc-match', 'toc-dim');
      }
    }

    function performSearch() {
      var query = input.value.trim().toLowerCase();
      if (!query) {
        if (clearBtn) clearBtn.hidden = true;
        resultsList.hidden = true;
        resultsList.innerHTML = '';
        status.textContent = '';
        if (searchContainer) searchContainer.classList.remove('has-results', 'has-query');
        resetToc();
        return;
      }

      if (clearBtn) clearBtn.hidden = false;
      if (searchContainer) searchContainer.classList.add('has-query');

      var tokens = query.split(/\s+/).filter(Boolean);
      var matched = [];

      for (var i = 0; i < chapters.length; i++) {
        var ch = chapters[i];
        var allMatch = true;
        var score = 0;

        for (var t = 0; t < tokens.length; t++) {
          var tok = tokens[t];
          if (!ch.searchText.includes(tok)) {
            allMatch = false;
            break;
          }
          if (ch.title.toLowerCase().includes(tok)) score += 50;
          if (ch.groupTitle.toLowerCase().includes(tok)) score += 20;
          for (var f = 0; f < ch.features.length; f++) {
            if (ch.features[f].title.toLowerCase().includes(tok)) score += 30;
            if (ch.features[f].text.toLowerCase().includes(tok)) score += 10;
          }
        }

        if (allMatch) {
          matched.push({ chapter: ch, score: score });
        }
      }

      matched.sort(function (a, b) {
        return b.score - a.score;
      });

      var matchedIds = new Set(matched.map(function (m) { return m.chapter.id; }));

      // Update TOC state
      for (var tl = 0; tl < tocLinks.length; tl++) {
        var href = tocLinks[tl].getAttribute('href') || '';
        var targetId = href.replace(/^#/, '');
        if (matchedIds.has(targetId)) {
          tocLinks[tl].classList.add('toc-match');
          tocLinks[tl].classList.remove('toc-dim');
        } else if (matched.length > 0) {
          tocLinks[tl].classList.remove('toc-match');
          tocLinks[tl].classList.add('toc-dim');
        } else {
          tocLinks[tl].classList.remove('toc-match', 'toc-dim');
        }
      }

      // Open TOC details for matching items
      for (var td = 0; td < tocDetails.length; td++) {
        var hasMatch = tocDetails[td].querySelector('.toc-match');
        if (hasMatch) {
          tocDetails[td].open = true;
        }
      }

      if (matched.length === 0) {
        status.textContent = emptyText;
        resultsList.innerHTML = '<li class="search-no-results">' + escapeHtml(emptyText) + '</li>';
        resultsList.hidden = false;
        if (searchContainer) searchContainer.classList.add('has-results');
        return;
      }

      status.textContent = matched.length + ' ' + countSuffix;
      var html = '';
      for (var m = 0; m < matched.length; m++) {
        var ch = matched[m].chapter;
        var snippet = createSnippet(ch, tokens);
        html += '<li class="search-result-item">' +
          '<a href="#' + escapeHtml(ch.id) + '" class="search-result-link">' +
          '<div class="search-result-header">' +
          '<span class="search-result-eyebrow">' + escapeHtml(ch.groupTitle ? ch.groupTitle + ' · ' : '') + escapeHtml(ch.number) + '</span>' +
          '<strong class="search-result-title">' + highlightText(ch.title, tokens) + '</strong>' +
          '</div>' +
          '<p class="search-result-snippet">' + snippet + '</p>' +
          '</a>' +
          '</li>';
      }
      resultsList.innerHTML = html;
      resultsList.hidden = false;
      if (searchContainer) searchContainer.classList.add('has-results');
    }

    input.addEventListener('input', performSearch);

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        input.value = '';
        performSearch();
        input.focus();
      });
    }

    // Keyboard navigation in search results
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        input.value = '';
        performSearch();
        return;
      }
      if (e.key === 'ArrowDown') {
        var firstLink = resultsList.querySelector('a.search-result-link');
        if (firstLink) {
          e.preventDefault();
          firstLink.focus();
        }
      }
      if (e.key === 'Enter') {
        var topLink = resultsList.querySelector('a.search-result-link');
        if (topLink) {
          e.preventDefault();
          topLink.click();
        }
      }
    });

    resultsList.addEventListener('keydown', function (e) {
      var currentLink = document.activeElement;
      if (!currentLink || !currentLink.classList.contains('search-result-link')) return;

      var allLinks = Array.prototype.slice.call(resultsList.querySelectorAll('a.search-result-link'));
      var index = allLinks.indexOf(currentLink);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (index < allLinks.length - 1) {
          allLinks[index + 1].focus();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (index > 0) {
          allLinks[index - 1].focus();
        } else {
          input.focus();
        }
      } else if (e.key === 'Escape') {
        input.value = '';
        performSearch();
        input.focus();
      }
    });

    // Close results dropdown on outside click or navigation
    document.addEventListener('click', function (e) {
      if (searchContainer && !searchContainer.contains(e.target)) {
        resultsList.hidden = true;
        if (searchContainer) searchContainer.classList.remove('has-results');
      }
    });

    // Reopen results when focusing input if query present
    input.addEventListener('focus', function () {
      if (input.value.trim() && resultsList.children.length > 0) {
        resultsList.hidden = false;
        if (searchContainer) searchContainer.classList.add('has-results');
      }
    });

    // When clicking a search result link
    resultsList.addEventListener('click', function (e) {
      var link = e.target.closest('a.search-result-link');
      if (link) {
        resultsList.hidden = true;
        if (searchContainer) searchContainer.classList.remove('has-results');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGuideSearch);
  } else {
    initGuideSearch();
  }
})();
