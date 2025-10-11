/**
 * Flags object holds the current filter state for each filter type.
 * It is loaded from the URL hash if present, otherwise initialized empty.
 */
let flags;

// --- Filter options arrays ---
const technologies = [
  "Arcade",
  "ArcGIS API for Python",
  "ArcGIS Dashboards",
  "ArcGIS Enterprise",
  "ArcGIS Enterprise SDK",
  "ArcGIS GeoAnalytics Engine",
  "ArcGIS Location Platform",
  "ArcGIS Maps SDK for .NET",
  "ArcGIS Maps SDK for Flutter",
  "ArcGIS Maps SDK for Javascript",
  "ArcGIS Maps SDK for Kotlin",
  "ArcGIS Maps SDK for Qt",
  "ArcGIS Maps SDK for Swift",
  "ArcGIS Online",
  "ArcGIS Pro SDK",
  "ArcGIS REST JS",
  "ArcGIS services",
  "ArcGIS StoryMaps",
  "Arcpy",
  "Calcite Design System",
  "Engineering",
  "Experience Builder",
  "Game Engines",
  "General",
  "Living Atlas",
  "Native SDKs",
  "Other",
  "R",
  "Security and authentication",
  "Survey123",
  "Web technologies"
];

const categories = [
  "Blog",
  "Course",
  "DevSummit video",
  "Documentation",
  "In-person event ",
  "Livestream",
  "Other",
  "Podcast",
  "Social post",
  "Source code",
  "Training seminar",
  "Video",
  "Video Short",
  "Press release",
  "Book",
  "Tutorial"
];

const channels = [
  "Esri",
  "Community",
  "Employee"
];

const authors = [
  "Esri",
  "Distributor",
  "Community",
  "Multiple",
  "Unknown"
];

const languages = [
  "English",
  "German",
  "Korean",
  "Spanish"
];

try {
  // Try to load filter state from URL hash (compressed)
  const parts = new URL(window.location.href);
  if (parts.hash == '') {
    throw new Error('No hash');
  }
  flags = JSON.parse(LZString.decompressFromBase64(parts.hash.substr(1)));
} catch (error) {
  // Default filter state if no hash present
  flags = {
    "technologies": {},
    "categories": {},
    "channels": {},
    "authors": {},
    "languages": {}
  }
}

/**
 * Searches for a value in a nested JSON object.
 * Used to check if a filter option is selected in flags.
 * @param {Object} jsonObject - The flags object
 * @param {string} targetKey - The filter option value
 * @returns {any} - The value if found, otherwise null
 */
const findValueInNestedJSON = (jsonObject, targetKey) => {
  for (const outerKey in jsonObject) {
    if (jsonObject.hasOwnProperty(outerKey)) {
      const innerObject = jsonObject[outerKey];
      if (innerObject.hasOwnProperty(targetKey)) {
        return innerObject[targetKey];
      }
    }
  }
  return null;
};

/**
 * Loads options into a Calcite combobox from an array.
 * Sets the selected state based on flags.
 * @param {Array} options - Array of option strings
 * @param {string} idContainer - CSS selector for the combobox
 * @param {string} templateId - CSS selector for the combobox item template
 */
const loadCombobox = (options, idContainer, templateId) => {
  const topicsSelector = document.querySelector(idContainer);
  const template = document.querySelector(templateId);

  options.forEach((e, i, array) => {
    const clone = template.content.cloneNode(true);
    clone.firstElementChild.setAttribute("value", e);
    clone.firstElementChild.setAttribute("text-label", e);
    // Set selected if flagged or not present in flags
    const val = findValueInNestedJSON(flags, e);
    if (val === 1 || val === null) {
      clone.firstElementChild.setAttribute("selected", null);
    }
    topicsSelector.appendChild(clone);
  });
};

/**
 * Updates the flags object and table row visibility when a filter changes.
 * @param {Event} e - The combobox change event
 * @param {string} keyword - The filter type (e.g. 'technologies')
 */
const updateFlags = (e, keyword) => {
  // Unselected options: set flag to 0 and hide matching rows
  e.currentTarget.querySelectorAll(':not([selected])').forEach(e => {
    flags[keyword][e.value] = 0;
    const filter = `calcite-table-row[data-${keyword}='${e.value}']`;
    document.querySelectorAll(filter).forEach(e => {
      e.classList.add("hidden");
    });
  });

  // Selected options: set flag to 1 and show matching rows if all filters match
  e.currentTarget.querySelectorAll('[selected]').forEach(e => {
    flags[keyword][e.value] = 1;

    const filter = `calcite-table-row[data-${keyword}='${e.value}']`;
    document.querySelectorAll(filter).forEach(e => {
      if (
        flags.channels[e.dataset.channels] &&
        flags.technologies[e.dataset.technologies] &&
        flags.categories[e.dataset.categories]
      ) {
        e.classList.remove("hidden");
      }
    });
  });

  // Update URL hash with new filter state
  window.history.pushState(
    { title: "Services" },
    "servicespage",
    "#" + LZString.compressToBase64(JSON.stringify(flags))
  );
};

loadCombobox(technologies, "#topics", "#templateTopicRow");
document.querySelector('#topics').addEventListener("calciteComboboxChange", (e) => updateFlags(e, 'technologies'));

loadCombobox(categories, "#category", "#templateTopicRow");
document.querySelector('#category').addEventListener("calciteComboboxChange", (e) => updateFlags(e, 'categories'));

loadCombobox(channels, "#channel", "#templateTopicRow");
document.querySelector('#channel').addEventListener("calciteComboboxChange", (e) => updateFlags(e, 'channels'));

/**
 * Initializes the app, triggers filter events, and starts the intro tour if needed.
 */
const initApp = () => {
  const hidrated = document.querySelector('#channel').getAttribute("calcite-hydrated");
  if (hidrated != '') {
    setTimeout(initApp, 1000);
  } else {
    const event = new Event("calciteComboboxChange");
    document.querySelector('#topics').dispatchEvent(event);
    document.querySelector('#category').dispatchEvent(event);
    document.querySelector('#channel').dispatchEvent(event);
    if (!localStorage.getItem("tourDisplayed")) {
      introJs().start();
      localStorage.setItem("tourDisplayed", true);
    }
  }
};
initApp();

// Help button triggers intro tour
document.querySelector('#help').addEventListener("click", e => introJs().start());

/**
 * Formats a date string as "DD Month YYYY".
 * @param {string} dateString - The date string to format
 * @returns {string} - Formatted date or original string if invalid
 */
function formatDate(dateString) {
  const date = new Date(dateString);
  if (isNaN(date)) return dateString;
  const day = date.getDate();
  const month = date.toLocaleString('default', { month: 'long' });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}