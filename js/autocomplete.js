/**
 * Autocomplete module for fish name input
 */

const Autocomplete = (function() {
  let fishDatabase = [];
  let inputElement = null;
  let listElement = null;
  let currentFocus = -1;
  let onSelectCallback = null;
  let guessedFish = new Set();

  function init(input, list, database, onSelect) {
    inputElement = input;
    listElement = list;
    fishDatabase = database;
    onSelectCallback = onSelect;

    inputElement.addEventListener('input', handleInput);
    inputElement.addEventListener('keydown', handleKeydown);
    inputElement.addEventListener('focus', handleFocus);
    document.addEventListener('click', handleClickOutside);
  }

  function setGuessedFish(guessed) {
    guessedFish = new Set(guessed);
  }

  function handleInput(e) {
    const value = e.target.value.toLowerCase().trim();
    closeList();

    if (!value) return;

    const matches = fishDatabase
      .filter(fish => {
        const nameMatch = fish.name.toLowerCase().includes(value);
        const scientificMatch = fish.scientificName.toLowerCase().includes(value);
        return (nameMatch || scientificMatch) && !guessedFish.has(fish.id);
      })
      .slice(0, 8);

    if (matches.length === 0) return;

    listElement.classList.remove('hidden');
    currentFocus = -1;

    matches.forEach((fish, index) => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.dataset.index = index;
      item.dataset.fishId = fish.id;

      // Highlight matching text
      const nameHtml = highlightMatch(fish.name, value);
      const scientificHtml = highlightMatch(fish.scientificName, value);

      item.innerHTML = `
        <div class="fish-name">${nameHtml}</div>
        <div class="scientific-name">${scientificHtml}</div>
      `;

      item.addEventListener('click', () => selectItem(fish));
      item.addEventListener('mouseenter', () => {
        removeActive();
        currentFocus = index;
        item.classList.add('active');
      });

      listElement.appendChild(item);
    });
  }

  function highlightMatch(text, query) {
    const index = text.toLowerCase().indexOf(query.toLowerCase());
    if (index === -1) return text;

    const before = text.substring(0, index);
    const match = text.substring(index, index + query.length);
    const after = text.substring(index + query.length);

    return `${before}<strong>${match}</strong>${after}`;
  }

  function handleKeydown(e) {
    const items = listElement.getElementsByClassName('autocomplete-item');
    if (items.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        currentFocus++;
        if (currentFocus >= items.length) currentFocus = 0;
        setActive(items);
        break;

      case 'ArrowUp':
        e.preventDefault();
        currentFocus--;
        if (currentFocus < 0) currentFocus = items.length - 1;
        setActive(items);
        break;

      case 'Enter':
        e.preventDefault();
        if (currentFocus > -1 && items[currentFocus]) {
          const fishId = items[currentFocus].dataset.fishId;
          const fish = fishDatabase.find(f => f.id === fishId);
          if (fish) selectItem(fish);
        } else if (items.length === 1) {
          // Auto-select if only one match
          const fishId = items[0].dataset.fishId;
          const fish = fishDatabase.find(f => f.id === fishId);
          if (fish) selectItem(fish);
        }
        break;

      case 'Escape':
        closeList();
        break;
    }
  }

  function handleFocus() {
    const value = inputElement.value.trim();
    if (value) {
      handleInput({ target: inputElement });
    }
  }

  function handleClickOutside(e) {
    if (e.target !== inputElement && !listElement.contains(e.target)) {
      closeList();
    }
  }

  function setActive(items) {
    removeActive();
    if (currentFocus >= 0 && currentFocus < items.length) {
      items[currentFocus].classList.add('active');
      items[currentFocus].scrollIntoView({ block: 'nearest' });
    }
  }

  function removeActive() {
    const items = listElement.getElementsByClassName('autocomplete-item');
    Array.from(items).forEach(item => item.classList.remove('active'));
  }

  function selectItem(fish) {
    inputElement.value = fish.name;
    closeList();
    if (onSelectCallback) {
      onSelectCallback(fish);
    }
  }

  function closeList() {
    listElement.innerHTML = '';
    listElement.classList.add('hidden');
    currentFocus = -1;
  }

  function clear() {
    inputElement.value = '';
    closeList();
  }

  function disable() {
    inputElement.disabled = true;
    closeList();
  }

  function enable() {
    inputElement.disabled = false;
  }

  return {
    init,
    setGuessedFish,
    clear,
    disable,
    enable,
    closeList
  };
})();
