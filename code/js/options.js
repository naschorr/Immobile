/* Globals */
var CURRENT_RULES_TEXT = chrome.i18n.getMessage('options_current_rules_string');
var NO_RULES_TEXT = chrome.i18n.getMessage('options_no_rules_string');
var NO_EMPTY_TEXT = chrome.i18n.getMessage('options_no_empty_rule_string');
var NO_DUPS_TEXT = chrome.i18n.getMessage('options_no_duplicates_string');
var NO_CYCLES_TEXT = chrome.i18n.getMessage('options_no_cycles_string');
var MISMATCHED_SUBDOMAINS_TEXT = chrome.i18n.getMessage('options_mismatched_subdomains_string');
var WARNING_SYMBOL = '\u26a0';
var SUCCESS_SYMBOL = '\u2713';
/* End Globals */

/* Note: 'Rule' refers to the combination of the source and destination domains. */

/* Methods */
/**
 * Determines if a given object has the specified key and if the object has the given key, value pair.
 * @param {object} obj - The object to be checked.
 * @param {string} key - The name of the key to look for.
 * @param {string} value - The name of the value to check for.
 * @return {boolean} True if the object does have the key and corresponding value. False if it doesn't.
 */
function hasValue(obj, key, value) {
	return obj.hasOwnProperty(key) && obj[key] === value;
}

/**
 * Determines if a given string contains non-whitespace characters (and isn't empty).
 * @param {string} string - The string to be checked.
 * @return {boolean} True if the string does have non-whitespace characters. False if it doesn't.
 */
function hasChars(string) {
	/* '\S' checks for non-whitespace characters. */
	if(/\S/.test(string)) {
		return true;
	}
	return false;
}

/**
 * Gets the index associated with a given button's id. This index can then be used to delete specific redirection rules.
 * @param {string} buttonId - The id associated with a button in the current rules table.
 * @return {int|null} The integer representing the button's index in the rules table, or null if there isn't a valid index.
 */
function getButtonIndex(buttonId) {
	try {
		var index = parseInt(buttonId.match(/([0-9])+/)[0], 10);
	}
	catch (error){
		if(error instanceof TypeError) {
			console.error(`TypeError in getButtonIndex(). Arg: "${buttonId}" Error: ', ${error}`);
			return null;
		}
	}

	return index;
}

/**
 * Calculates the length of time it should take someone to read the provided string (in milliseconds).
 * @param {string} string - The string to check for how long it takes to read.
 * @return {int} The time in milliseconds that it should take for someone to read the string. 0 if the string is empty
 */
function calcTimeToReadString(string) {
	if(string) {
		return 500 + 75 * string.length;
	}
	return 0;
}

/**
 * Attempts to remove the protocol, leading forward slashes, and the path from a URL.
 * @param {string} url - The url to (attempt to) remove the protocol and path from/
 * @return {string} url - The resulting domain, or the url if a domain couldn't be found.
 */
function getDomain(url) {
	/* Need to combine these regexs into one statement somehow */
	var noProtocol = /\/\/(.+)/i.exec(url);
	if(noProtocol) {
		noProtocol = noProtocol[1];
	}else{
		noProtocol = url;
	}

	var noPath = /(.+?)\//i.exec(noProtocol);
	if(noPath) {
		noPath = noPath[1];
	}else{
		noPath = url;
	}
	return noPath;
}

/**
 * Displays a notification to the user, alerting them of any errors or suggestions.
 * @param {char|string} symbol - The string or character that's shown at the top of the popup. Often a unicode symbol relating to the nature of the popup.
 * @param {string} text - The main text shown to the user when the notification pops up. Often used to tell the user what went wrong.
 * @param {string} color - The name of a color (defined as a CSS class) that the notification should use as its background.
 * @param {int} delay - Time (in milliseconds) to wait before calling the callback function. Null if a delay isn't necessary.
 * @param {function} callback - The function to be invoked either after the notification has been displayed, potentially after a delay. Mostly used to call the hideNotificationPopup function.
 */
function showNotificationPopup(symbol, text, color, delay, callback) {
	/* Don't bother showing the popup if the delay is instant */
	if(delay === 0) {
		return;
	}

	if(text) {
		var notificationElement = document.getElementById('notificationPopup');
		document.getElementById('notificationPopupStatus').innerHTML = text;
		if(color) {
			notificationElement.classList.add(color);
		}
		if(symbol) {
			document.getElementById('notificationPopupStatusIcon').innerHTML = symbol;
		}
		notificationElement.classList.add('visible');
	}

	/* Callback is mostly to be used to call hideNotificationPopup(). Delay specifies a timer before calling the callback. */
	if(callback) {
		if(delay != null) {
			setTimeout(function() {
				callback();
			}, delay);
		}else{
			callback();
		}
	}
}

/**
 * Hides the notification popup by emptying the text sections, and removing the added styles.
 */
function hideNotificationPopup() {
	document.getElementById('notificationPopup').className = 'notification-popup';
	document.getElementById('notificationPopupStatusIcon').innerHTML = '';
	document.getElementById('notificationPopupStatus').innerHTML = '';
}

/**
 * Attempts to calculate the difference in the number of subdomains beteween the source and destination domains. This can potentially forecast some redirection problems if a difference is present.
 * @param {string} source - The domain to redirect from.
 * @param {string} destination - The domain to redirect to.
 * @return {int} The difference in subdomain counts between the source and destination.
 */
function getSubdomainDifference(source, destination) {
	source = getDomain(source);
	destination = getDomain(destination);

	var longer;
	var shorter;
	/* Determine which domain is longer */
	if(destination.length >= source.length) {
		longer = destination;
		shorter = source;
	}else{
		longer = source;
		shorter = destination;
	}

	/* Attempt to remove the smaller domain from the larger domain. */
	var postReplace = longer.replace(shorter, '');

	/* If the removal wasn't successful, then return a difference of 0. */
	if(postReplace.length === longer.length) {
		return 0;
	}

	/* Count the periods remaining after the removal operation. This can roughly determine if there was a difference in number of subdomains. */
	var periodCounter = 0;
	for(var i = 0; i < postReplace.length; i++) {
		if(postReplace.charAt(i) === '.') {
			periodCounter++;
		}
	}

	return periodCounter;
}

/**
 * Determines if the proposed redirection rule is valid, and thus can be added to the array of active rules. Also alerts the user with a notification if the rule fails a test.
 * @param {string} source - The proposed domain to redirect from.
 * @param {string} destination - The proposed domain to redirect to.
 * @param {array} rules - Array of 'rules' objects to check against. {src:"source URL (or regex pattern)", dest:"destination URL", regex:boolean if .src is a regex}
 * @return {boolean} True if the proposed redirection rule passes the tests. False if it doesn't.
 */
function isValidInput(source, destination, rules) {
	/* Can't be empty or only have whitespace characters. */
	if(!hasChars(source) || !hasChars(destination)) {
		showNotificationPopup(WARNING_SYMBOL, NO_EMPTY_TEXT, 'red', calcTimeToReadString(NO_EMPTY_TEXT), hideNotificationPopup);
		return false;
	}

	/* Can't have duplicate sources. */
	if(rules.some(function(obj) {
		return hasValue(obj, "src", source);
	})) {
		showNotificationPopup(WARNING_SYMBOL, NO_DUPS_TEXT, 'red', calcTimeToReadString(NO_DUPS_TEXT), hideNotificationPopup);
		return false;
	}

	/* Can't have a new source that's already a destination. */
	if(rules.some(function(obj) {
		return hasValue(obj, "dest", source);
	})) {
		showNotificationPopup(WARNING_SYMBOL, NO_CYCLES_TEXT, 'red', calcTimeToReadString(NO_CYCLES_TEXT), hideNotificationPopup);
		return false;
	}

	/* 
		Could still be a valid rule, but alert users to potential issues with their source and destination subdomain counts. 
		(ex. amazon.com -> smile.amazon.com won't work, but www.amazon.com -> smile.amazon.com will work.) 
	*/
	if(getSubdomainDifference(source, destination) > 0) {
		showNotificationPopup(SUCCESS_SYMBOL, MISMATCHED_SUBDOMAINS_TEXT, 'green', calcTimeToReadString(MISMATCHED_SUBDOMAINS_TEXT), hideNotificationPopup);
	}
	
	return true;
}

/**
 * Stores a given source and destination domain into chrome's storage as a rule.
 * @param {string} source - The domain to redirect from.
 * @param {string} destination - The domain to redirect to.
 * @param {boolean} isRegex - True if the rule uses regex, False if it doesn't.
 */
function storeRule(source, destination, isRegex) {
	// Object format = {src:"source URL (or regex pattern)", dest:"destination URL", regex:boolean if .src is a regex}
	chrome.storage.sync.get("redirectionRules", function(result) {
		var rules = result.redirectionRules || [];

		if(isValidInput(source, destination, rules)) {
			source = source.trim();
			rules.push({src:source, dest:destination.trim(), regex:isRegex});

			chrome.storage.sync.set({redirectionRules: rules}, function() {
				chrome.runtime.sendMessage({addRule: source});
				debugLog(`Added new rule: '${source}' -> '${destination}', regex: ${isRegex}`);
				updateRulesTable();
			})
		}else{
			debugLog(`Failed to add rule: '${source}' -> '${destination}', regex: ${isRegex}. Rule is either empty, a duplicate, or produces a cycle.`);
		}
	})
}

/**
 * Deletes a redirection rule. Uses the index stored in the delete button's id to delete the rule.
 * @param {string} buttonId - The id of the delete button for a given rule.
 */
function deleteRule(buttonId) {
	var buttonIndex = getButtonIndex(buttonId);

	/* Make sure that there is a legitimate index to delete with */
	if(buttonIndex === null) {
		debugLog(`Invalid button index from button: ${buttonId}`);
		return;
	}

	chrome.storage.sync.get("redirectionRules", function(result) {
		var rules = result.redirectionRules || [];
		var removed = rules.splice(buttonIndex, 1)[0];

		chrome.storage.sync.set({redirectionRules: rules}, function() {
			chrome.runtime.sendMessage({deleteRule: removed.src});
			debugLog(`Rule associated with ${buttonId} has been deleted`);
			updateRulesTable();
		})
	})
}

/**
 * Adds a listener for a specific delete button. When triggered, it'll try to delete the corresponding redirection rule.
 * @param {string} buttonId - The id of the button to receive the listener.
 */
function addBtnListener(buttonId) {
	document.getElementById(buttonId).addEventListener('click', function() {
		debugLog(`listener triggered for ${buttonId}`);
		deleteRule(buttonId);
	})
}

/**
 * Builds a formatted HTML table of all current redirection rules, as well as sets up the buttons used to delete individual rules.
 */
function buildRulesTable() {
	chrome.storage.sync.get("redirectionRules", function(result) {
		var rules = result.redirectionRules || [];
		var ruleCount = rules.length;

		if(rules.length > 0) {
			var tableContainer = document.getElementById('currentRulesTableContainer');
			document.getElementById('currentRulesStatus').innerHTML = CURRENT_RULES_TEXT;

			var table = document.createElement('table');
			table.id = 'currentRulesTable';

			/* Generate the table */
			for(var row = 0; row < ruleCount; row++) {
				var tr = table.insertRow();
				
				var source = tr.insertCell();
				source.appendChild(document.createTextNode(rules[row].src));

				var arrow = tr.insertCell();
				var span = document.createElement('span');
				span.className = 'arrow';
				span.appendChild(document.createTextNode('\u2192'));
				arrow.appendChild(span);

				var destination = tr.insertCell();
				destination.appendChild(document.createTextNode(rules[row].dest));

				var button = tr.insertCell();
				var buttonTextNode = document.createTextNode('\u232b');
				var buttonElement = document.createElement('BUTTON');
				buttonElement.appendChild(buttonTextNode);
				buttonElement.className = "delete-rule-button";
				buttonElement.id = `deleteRuleButton-${row}`;
				button.appendChild(buttonElement);
			}
			tableContainer.appendChild(table);

			/* Generate the listeners for the buttons in the table */
			for(var btn = 0; btn < ruleCount; btn++) {
				addBtnListener(`deleteRuleButton-${btn}`);
			}

		}else{
			document.getElementById('currentRulesStatus').innerHTML = NO_RULES_TEXT;
		}
	})
}

/**
 * Deletes the HTML table of redirection rules.
 */
function deleteRulesTable() {
	/* Should also delete the listeners that the buttons reference. */
	var table = document.getElementById('currentRulesTable');
	if(table) {
		/* Don't delete the table if it doesn't exist. */
		table.parentNode.removeChild(table);
	}
}

/**
 * 'Updates' the HTML table of redirection rules by deleting it, and then rebuilding it.
 */
function updateRulesTable() {
	deleteRulesTable();
	buildRulesTable();
}

/**
 * Load the localized text from messages.json (via chrome.i18n), and apply the strings to forward facing elements of the interface.
 */
function loadLocalizedText() {
	document.title = chrome.i18n.getMessage('options_title');
	document.getElementById('addRuleStatus').innerHTML = chrome.i18n.getMessage('options_add_rule_string');
	document.getElementById('addRuleMobile').placeholder = chrome.i18n.getMessage('options_new_source_placeholder');
	document.getElementById('addRuleDesktop').placeholder = chrome.i18n.getMessage('options_new_destination_placeholder');
	document.getElementById('addRuleConfirm').value = chrome.i18n.getMessage('options_add_rule_button');
	document.getElementById('addRuleOrRegexText').innerHTML = chrome.i18n.getMessage('options_add_rule_or_regex');
	document.getElementById('addRegexConfirm').value = chrome.i18n.getMessage('options_add_regex_button');
}
/* End Methods */

/* Listener Init */
document.addEventListener('DOMContentLoaded', buildRulesTable());

var mobileInputElement = document.getElementById('addRuleMobile');
var desktopInputElement = document.getElementById('addRuleDesktop');

var addRuleBtn = document.getElementById('addRuleConfirm');
addRuleBtn.addEventListener('click', function() {
	/* Store the rule */
	storeRule(mobileInputElement.value, desktopInputElement.value, false);
	/* Clear the input box's text */
	mobileInputElement.value = '';
	desktopInputElement.value = '';
});

var addRegexBtn = document.getElementById('addRegexConfirm');
addRegexBtn.addEventListener('click', function() {
	/* Store the rule */
	storeRule(mobileInputElement.value, desktopInputElement.value, true);
	/* Clear the input box's text */
	mobileInputElement.value = '';
	desktopInputElement.value = '';
})
/* End Listener Init */

/* Localization Init */
document.addEventListener('DOMContentLoaded', loadLocalizedText());
/* End Localization */