"use strict";

// Cookie title for dismissible alerts
var COOKIE_TITLE = "va_embeddings_browser_dismissible_alert_closed";

// The threshold between adjacent year entries to introduce a gap in the time chart
var YEAR_GAP_THRESHOLD = 5; 

// Current window size (used to ignore redundant resize events)
var windowWidth;
var windowHeight;

// Metadata about the schema and content
var schemaVersion;
var schemaLastUpdated;
var schemaNotes;
var contentVersion;
var contentLastUpdated;
var contentBaseSchemaVersion;
var contentNotes;

// Array of categories data as hierarchical structure
var categories = [];
// Map of categories indexed by title
var categoriesMap = {};
// Category indices (used for output sorting purposes)
var categoriesIndices = {};

// List of categories that do not cover the whole entries set
var incompleteCategories = [];

// Array of free categories data
var freeTextCategories = [];
// Map of free text categories indexed by title
var freeTextCategoriesMap = {};


// Map of entries indexed by IDs
var entriesMap = {};

// List of currently displayed entries (not really used at the moment...)
var currentlyDisplayedEntries = [];

// Categories statistics (used for D3 diagram)
var stats = {};
// Statistics entries map (used for indexing)
var statsMap = {};

// Free text category stastistics map
var freeTextStatsMap = {};

// Search field value
var searchText = "";

// Time filter entries
var timeFilterEntries = [];

// References to the time chart-related objects
var timeChartSvg;
var timeChartXScale;
var timeChartYScale;
var timeChartHeight;
var timeChartData;

$(document).ready(function(){
	windowWidth = $(window).width();
	windowHeight = $(window).height();
	
    setupTooltips();
    loadCategories();
    setupHandlers();
    
    // Display the dismissible alert, if necessary
    if ($("#topAlert").length > 0 && !$.cookie(COOKIE_TITLE)) {
    	$("#topAlert").removeClass("hidden");
    }
});

// Handles window resize
$(window).resize(function() {
    if(this.resizeTO) clearTimeout(this.resizeTO);
    this.resizeTO = setTimeout(function() {
        $(this).trigger('resizeEnd');
    }, 500);
});

$(window).bind('resizeEnd', function(){
	// Check if the resize really occurred
	let newWidth = $(window).width();
	let newHeight = $(window).height();
	
	if (newWidth != windowWidth
		|| newHeight != windowHeight) {
		windowWidth = newWidth;
		windowHeight = newHeight;
	} else {
		// Abort the handler
		return;
	}
		
	// Update the layout size
	updateLayoutSize();
});

// Updates the vertical layout size
function updateLayoutSize() {
	let entriesContainer = $("#entriesContainer");
	
	let maxEntriesContainerHeight = $(window).height() - $(".navbar.custom-navbar").height()
		- parseInt($(".navbar.custom-navbar").css("margin-bottom")) * 2;
	
	if (maxEntriesContainerHeight < parseInt(entriesContainer.css("min-height")))
		maxEntriesContainerHeight = parseInt(entriesContainer.css("min-height"));
	
	entriesContainer.height(maxEntriesContainerHeight);
	
	let categoriesListContainer = $("#categoriesList");
	
	let filterPanelTopHeight = 0;
	$("#filtersPanel > *:not(#categoriesList)").each(function(){
		filterPanelTopHeight += $(this).outerHeight();
	});
		
	// Set a reasonable fallback value
	let maxCategoriesListContainerHeight = Math.max(maxEntriesContainerHeight - filterPanelTopHeight, parseInt(entriesContainer.css("min-height")));
		
	categoriesListContainer.height(Math.min(categoriesListContainer[0].scrollHeight, maxCategoriesListContainerHeight));
}

function setupTooltips(){
	$("body").tooltip({
		selector: "[data-tooltip=tooltip], #timeChartSvg g.time-chart-entry.not-gap",
        container: "body",
        placement: "auto"
    });
}

function setupHandlers(){
	$(".search-clear").on("click", onSearchClear);
	$("#searchField").on("keyup", onSearch);
	
	$("#categoriesList")
		.on("click", ".category-entry", onFilterToggle)
		.on("click", ".reset-category-filter", onCategoryFilterReset)
		.on("change", ".free-text-category-item input:checkbox", onFreeTextCategoryFilterToggle);
	
	$("#entriesContainer").on("click", ".content-entry", onEntryClick);
	
	$("#entryDetailsModal").on("hidden.bs.modal", onDetailsModalHidden);
	
	$("#addEntryModal").on("keypress", function(e) {
		if (e.which == 13)
			$("#processNewEntry").click();
	});
	
	$("#addEntryModal form").on("reset", onAddFormReset);
	
	$("#processNewEntry").on("click", onAddEntry);
	
	$("#aboutModal").on("shown.bs.modal", onAboutModalShown);
	
	$(window).on("resize", function(){
		if ($("#aboutModal").hasClass("in"))
			onAboutModalShown();
	});
	
	// Hide the dismissible top alert
	$("#topAlert").on("close.bs.alert", function(){
		$.cookie(COOKIE_TITLE, true, { expires: 365, path: "/" });
	});
}

function onSearch(){
	searchText = $("#searchField").val();
	updateDisplayedEntries();
}

function onSearchClear(){
	$("#searchField").val("");
	$("#searchField").trigger("keyup");
}

function onFilterToggle(){
	let element = $(this);
	
	if (!element.hasClass("active"))
		element.addClass("active");
	else
		element.removeClass("active");
	
	updateCategoryResetButton(element);
	updateDisplayedEntries();
}

function updateCategoryResetButton(element){
	let container = element.parent();
	let resetButton = container.parent().find(".reset-category-filter");
	
	if (container.children(".category-entry:not(.active)").length > 0)
		resetButton.removeClass("hidden");
	else
		resetButton.addClass("hidden");
}

function onCategoryFilterReset(){
	let element = $(this);
	
	element.parent().next(".category-entries-container").children(".category-entry").addClass("active");
	element.addClass("hidden");
	
	updateDisplayedEntries();
}

function onFreeTextCategoryFilterToggle(){
	let element = $(this);

	let parentElement = element.parents(".free-text-category-item").first();
	if (!parentElement.length)
		return;
	
	//console.log("Current element: ", element, "checked: " + element.prop("checked"), "parent category:" + parentElement.data("category"));
	updateDisplayedEntries();
}



// Handles the entry click from the main container
function onEntryClick(){
	let id = $(this).data("id");
	
	if (!entriesMap[id])
		return;
	
	$(this).tooltip("hide");
	
	$(this).addClass("active");
	
	displayEntryDetails(id);
}

// Displays the details dialog for the provided entry ID
// Can be invoked from the summary table handler, for instance
function displayEntryDetails(id) {
	if (!entriesMap[id])
		return;
	
	let entry = entriesMap[id];
	
	//$("#entryDetailsThumbnail").attr("src", entry.thumb200.src);
	// Since the large thumbnails are not preloaded anymore, load the thumbnail via URL
	$("#entryDetailsThumbnail").attr("src", "thumbs200/" + id + ".png");
	
	$("#entryDetailsModal .entry-details-field").empty();
	
	$("#entryDetailsTitle").html(entry.title + " (" + entry.year + ")");
	
	if (entry.authors)
		$("#entryDetailsAuthors").html("by " + entry.authors);
	
	if (entry.references)
		$("#entryDetailsReferences").html(entry.references.map(ref => ("<p>" + ref + "</p>")));
	
	if (entry.urls)
		$("#entryDetailsUrls").html(entry.urls
			.map(url => ("<p>URL: <a href=\"" + url + "\" target=\"_blank\">" + url + "</a></p>"))
		);
	
	$("#entryDetailsBibtex").html("<a href=\"" + ("bibtex/" + entry.id + ".bib" )
			+ "\" target=\"_blank\"><span class=\"glyphicon glyphicon-save\"></span> BibTeX</a>");
	
	$.each(entry.categories, function(i,d){
		let item = categoriesMap[d];
		
		let element = $("<span class=\"category-entry category-entry-span\""
			    + "data-tooltip=\"tooltip\"></span>");
		element.prop("title", item.descriptionPrefix
				? item.descriptionPrefix + item.description
				: item.description);
		element.append(item.content);
		
		$("#entryDetailsCategories").append(element);
		$("#entryDetailsCategories").append(" ");
	});

	$.each(freeTextCategories, function(i, categoryItem){
		if (!entry[categoryItem.title])
			return;
		
		let element = $("<h6/>");
		element.append("<b>" + categoryItem.description + "</b>: ");
		element.append(entry[categoryItem.title]);

		$("#entryDetailsFreeTextCategories").append(element);
	});
	
	$("#entryDetailsModal").modal("show");
}

function onDetailsModalHidden(){
	$(".content-entry.active").removeClass("active");
}

function updateDisplayedCount(){
	$("#displayedEntriesCount").text($("#entriesContainer .content-entry").size());
}

function onAddFormReset(){
	$("#addEntryModal form .form-group").removeClass("has-error").removeClass("has-success");
	$("#inputEntryCategories .category-entry.active").removeClass("active");
}

function loadCategories(){
	$.getJSON("data/categories.json", function(data){
		schemaVersion = data.version;
		schemaLastUpdated = data.lastUpdated;
		schemaNotes = data.notes;

		categories = data.categories;
		categoriesMap = {};
		categoriesIndices = {};
		
		incompleteCategories = [];
		
		stats = { description: "Complete Data Set", children: [] };
		statsMap = {};
		
		let topLevelCategoryContainer = $("#categoriesList");
		
		$.each(categories, function(i,d){
			appendCategoryFilter(d, null, topLevelCategoryContainer, stats);
		});
		
		initializeFormCategories();
		
		freeTextCategories = data.freeTextCategories;
		freeTextCategoriesMap = {};

		freeTextStatsMap = {};

		$.each(freeTextCategories, function(i,d){
			appendFreeTextCategoryFilter(d, topLevelCategoryContainer);
		});

		loadContent();
	});
}

// Initializes category data and appends the category filter in a recursive fashion
function appendCategoryFilter(item, parent, currentContainer, currentStats){
	// Check if category is disabled
	if (item.disabled)
		return;
	
	// Set parent category, if provided
	if (parent)
		item.parentCategory = parent;
	
	// First of all, include item into the maps
	categoriesMap[item.title] = item;
	categoriesIndices[item.title] = Object.keys(categoriesIndices).length;
	
	let statsEntry = { title: item.title, description: item.description, ids: {}};
	statsEntry.topCategory = currentStats.topCategory || item.title; 
	statsMap[item.title] = statsEntry;
	currentStats.children.push(statsEntry);
		
	if (item.type == "category") {
		let element = $("<li class=\"list-group-item category-item\"></li>");
		element.attr("data-category", item.title);
		element.append("<h5 class=\"category-title panel-label\">" + item.description + "</h5>");
		
		currentContainer.append(element);
		
		statsEntry.children = [];
		
		// Check if any non-nested child entries are available
		let childEntries = $.grep(item.entries, function(d){ return d.type == "category-entry"});
		
		if (childEntries.length > 0) {
			let childrenContainer = $("<div class=\"category-entries-container\"></div>");
			childrenContainer.attr("data-category", item.title);
			element.append(childrenContainer);
			
			// Add the filter reset button
			let resetButton = $("<button type=\"button\" class=\"btn btn-default btn-xs reset-category-filter hidden\" title=\"Reset filters\">"
					+ "<span class=\"glyphicon glyphicon-remove\"></span>"
					+ "</button>");
			resetButton.attr("data-category", item.title);
			
			element.children(".category-title").append(resetButton);
			
			$.each(childEntries, function(i,d){
				// Modify child element, if needed
				if (item.childrenDescription)
					d.descriptionPrefix = item.childrenDescription;
				
				appendCategoryFilter(d, item.title, childrenContainer, statsEntry);
			});
		}
		
		// Check if any nested child entries are available
		let childCategories = $.grep(item.entries, function(d){ return d.type == "category"});
		
		if (childCategories.length > 0) {
			let childrenContainer = $("<ul class=\"list-group nested-categories-list\"></ul>");
			element.append(childrenContainer);
			
			$.each(childCategories, function(i,d){
				appendCategoryFilter(d, item.title, childrenContainer, statsEntry);
			});
		}
	} else if (item.type == "category-entry") {
		let element = $("<button type=\"button\" class=\"btn btn-default category-entry active\""
					    + "data-tooltip=\"tooltip\"></button>");
		element.attr("data-entry", item.title);
		element.prop("title", item.description);
		element.append(item.content);
		
		currentContainer.append(element);
		currentContainer.append(" ");
	}
	
}


// Initializes free text category data and appends the category filter to the respect parent category
function appendFreeTextCategoryFilter(item, topLevelCategoryContainer) {
		// Check if category is disabled
		if (item.disabled)
			return;

		// Skip the filters without a proper parent category
		// (might be tweaked in the future, though, to allow general note filters, etc.)
		if (!item.parentCategoryTitle || !categoriesMap[item.parentCategoryTitle])
			return;
		
		// First of all, include item into the maps
		freeTextCategoriesMap[item.title] = item;

		let freeTextStatsEntry = { title: item.title, description: item.description, parentCategory: item.parentCategoryTitle,  ids: {}};
		freeTextStatsMap[item.title] = freeTextStatsEntry;

		// Prepare the filter UI elements
		let parentElement = topLevelCategoryContainer.find(".category-item[data-category=\"" + item.parentCategoryTitle  + "\"]");
		if (!parentElement.length)
			return;

		let element = $("<div class=\"free-text-category-item\" data-tooltip=\"tooltip\">"
			+ "<label><input type=\"checkbox\"> Extra Details Only</label>"
			+ "</div>");
		element.attr("data-category", item.title);
		element.prop("title", "Limit to Entries with " + item.description);

		parentElement.append(element);
}



// Initializes new entry category filters by copying HTML contents of filters panel
function initializeFormCategories(){
	$("#inputEntryCategories").html($("#categoriesList").html());
	
	$("#inputEntryCategories button")
	.removeClass("active")
	.attr("data-toggle", "button");
}

// Category entries comparator used for sorting
function categoriesComparator(d1, d2){
	return categoriesIndices[d1] - categoriesIndices[d2];
}

function loadContent(){
	$.getJSON("data/content.json", function(data){
		contentVersion = data.version;
		contentLastUpdated = data.lastUpdated;
		contentBaseSchemaVersion = data.baseSchemaVersion;
		contentNotes = data.notes;

		entriesMap = {};
		
		$.each(data.entries, function(i,d){
			entriesMap[d.id] = d;
			
			// Load thumbnails
			d.thumb100 = new Image();
			d.thumb100.src = "thumbs100/" + d.id + ".png";
			
			// If all thumbnails are loaded upfront, the data traffic is pretty large as of now...
			//d.thumb200 = new Image();
			//d.thumb200.src = "thumbs200/" + d.id + ".png";
						
			// Sort category tags to keep the output order consistent
			d.categories.sort(categoriesComparator);
			
			// Check if BibTeX file is available -- since all entries have BibTeX files now,
			// the check is disabled to reduce network traffic
			/*$.ajax({
				type: "HEAD",
				async: true,
				url: "bibtex/" + d.id + ".bib",
				success: function(){ d.hasBibtex = true; }
			});*/
						
			// Extract the list of author names
			d.allAuthors = getAllAuthors(d.authors);
			
			// Make sure all categories are lowercase to avoid errors
			for (let i = 0; i < d.categories.length; i++) {
				d.categories[i] = d.categories[i].toLowerCase();
			}
			
			// Update hierarchical categories
			d.categoriesMap = {};
			$.each(d.categories, function(index, category){
				if (categoriesMap[category] != undefined) {
					let parent = categoriesMap[category].parentCategory;
					if (!d.categoriesMap[parent])
						d.categoriesMap[parent] = [];
					
					d.categoriesMap[parent].push(category);
				} else {
					console.error("Error: unknown category '" + category + "' detected for '"
							+ d.id + "'", d);
				}
			});
			
			// Update category stats
			$.each(d.categories, function(index, category){	
				if (statsMap[category] != undefined) {
					statsMap[category].ids[d.id] = true;
					
					// Since this is an entry associated with some category,
					// it means that the immediate parent of the category contains individual
					// categories as "leafs"
					if (categoriesMap[category] && categoriesMap[category].parentCategory) {
						let parent = categoriesMap[category].parentCategory;
						statsMap[parent].hasDirectEntries = true;
					}
				}
			});

			// Update free-text category stats
			$.each(freeTextCategories, function(i, categoryItem){
				if (!d[categoryItem.title] || !freeTextStatsMap[categoryItem.title])
					return;
				
				freeTextStatsMap[categoryItem.title].ids[d.id] = true;
			});

		});
		
		calculateSorting();
		processStatistics();
		appendAuxiliaryFilters();
		markIncompleteCategoryEntries();
		
		renderTimeChart();
		
		configureTimeFilter();

		let totalCount = Object.keys(entriesMap).length;
				
		updateDisplayedEntries();
		
		// At this stage, the side panel height should be calculated properly
		updateLayoutSize();	
		
		populateSummaryTable();
		
		// Update the dialogs with notes on the total entry count, etc.
		$("#aboutModalTotalCountContainer").html("Total number of survey entries included: "
			+ "<span id=\"totalTechniquesCount\">"
			+ totalCount + "</span>");

		let versionNote = "Categorization schema v.&nbsp;" + schemaVersion + " (last updated: " + schemaLastUpdated + "), "
			+ " categorized data v.&nbsp;" + contentVersion + " (last updated: " + contentLastUpdated + ")."

		$("#aboutModalVersionContainer, #summaryTableModalVersionContainer").html(versionNote);

		// Run analyses useful for working on the survey articles, etc.
	  //analyseContent();
	});
}


// // Extracts the list of author names from the technique references
// function getAllAuthors(references){
// 	// Replacement dictionary for keeping author names consistent
// 	let dictionary = {
// 	};
	
// 	let authorsDict = {};

// 	for (let reference of references) {
// 		// Get the first part of the reference
// 		let authorsStr = reference.split(/\. <i>/)[0];
// 		if (!authorsStr || !authorsStr.length)
// 			continue;
		
// 		// Split into separate author names and trim (just in case)
// 		authorsStr.split(/, and | and |, /).forEach(function(d, i){
// 			if (!d || !d.length)
// 				return;
			
// 			let name = d.trim();
// 			if (dictionary[name])
// 				authorsDict[dictionary[name]] = true;
// 			else
// 				authorsDict[name] = true;
// 		});
// 	}

// 	return Object.keys(authorsDict).sort();
// }


// Extracts the list of author names from the respective field
// Requires the full author string to be separated by semicolons
function getAllAuthors(authorsStr){
	// Replacement dictionary for keeping author names consistent
	let dictionary = {
	};
	
	let authorsDict = {};

	// Split into separate author names and trim (just in case)
	authorsStr.split(/;/).forEach(function(d, i){
		if (!d || !d.trim().length)
			return;
		
		let name = d.trim();
		if (dictionary[name])
			authorsDict[dictionary[name]] = true;
		else
			authorsDict[name] = true;
	});

	return Object.keys(authorsDict).sort();
}



// Calculates a stable sorting order
function calculateSorting(){
	let ids = Object.keys(entriesMap);
	
	// Sort the entries by year in descending order,
	// entries without proper year value come last.
	// Secondary sorting field is ID (in ascending order), which corresponds to the first author surname.
	ids.sort(function(id1, id2){
		let d1 = entriesMap[id1];
		let d2 = entriesMap[id2];
		
		if (!d1.year && !d2.year)
			return 0;
		else if (!d1.year)
			return 1;
		else if (!d2.year)
			return -1;
		
		if (d2.year - d1.year)
			return d2.year - d1.year;
		
		if (d1.id && d2.id) 
			return d1.id.localeCompare(d2.id);
		else
			return 0;
	});
	
	$.each(ids, function(i,d){
		entriesMap[d].sortIndex = i;
	});
}

// Prepares category statistics for diagram rendering
function processStatistics(){
	// Collect the data in bottom-up fashion
	let aggregate = function(category){
		if (category.children) {
			$.each(category.children, function(i,d){
				let tempResults = aggregate(d);
				if (!category.ids)
					return;
				
				$.each(tempResults, function(k, v){
					category.ids[k] = v;
				});
			});
			
		}
		
		if (category.ids)
			category.value = Object.keys(category.ids).length;
		
		return category.ids;
	};
	
	aggregate(stats);
	
	/*// Assign the values in top-down fashion
	let propagate = function(category, totalValue){
		if (totalValue >= 0)
			category.value = totalValue;
		
		if (category.children) {
			let sum = d3.sum(category.children, function(d){ return Object.keys(d.ids).length + 2; });
			let coeff = (totalValue >= 0) ? totalValue / sum : 1 / sum;
			
			$.each(category.children, function(i, d){
				propagate(d, (Object.keys(d.ids).length + 2) * coeff);
			});
		}
	};
	propagate(stats, -1);*/	
}

// Appends auxiliary filter buttons to categories 
// that do not cover the whole entries set
function appendAuxiliaryFilters(){
	let totalCount = Object.keys(entriesMap).length;
	let content = "<span class=\"content-entry-label\">...</span>";
	
	$("#categoriesList .category-item").each(function(i,d){
		let element = $(d);
		let title = element.attr("data-category");
		
		// Prevent erroneous situations, including top-level categories
		// without nested "leaf" entries (such as "data" in TextVis Browser...)
		if (!statsMap[title] || !statsMap[title].hasDirectEntries)
			return;
		
		// Check if category covers the whole set
		if (Object.keys(statsMap[title].ids).length < totalCount) {
			incompleteCategories.push(title);
			
			let button = $("<button type=\"button\" class=\"btn btn-default category-entry category-other active\""
				    + "data-tooltip=\"tooltip\"></button>");
			button.attr("data-category", title);
			button.prop("title", "Other");
			button.append(content);
			
			element.find(".category-entries-container").append(button);
		}
	});
}

// Updates the entries with tags of corresponding "incomplete" categories
function markIncompleteCategoryEntries(){
	$.each(entriesMap, function(id, entry){
		entry.incompleteCategories = getIncompleteCategories(entry);
	});
	
}

// Returns an array of "incomplete" categories that entry is relevant to
function getIncompleteCategories(entry){
	let candidates = {};
	
	for (let i = 0; i < incompleteCategories.length; i++){
		candidates[incompleteCategories[i]] = true;
	}
	
	for (let i = 0; i < entry.categories.length; i++){
		if (categoriesMap[entry.categories[i]]) {
			let parent = categoriesMap[entry.categories[i]].parentCategory;
			delete candidates[parent];
		}
	}
	
	return Object.keys(candidates);
}

// Prepares the time chart data with year statistics and gaps
function prepareTimeChartData() {
	let yearEntries = [];
	
	let yearStats = {};
	let minYear = 1e6;
	let maxYear = -1e6;
	let maxYearCount = 0;
	$.each(entriesMap, function(k, v){
		if (!yearStats[v.year])
			yearStats[v.year] = 0;
		
		yearStats[v.year] += 1;
		
		if (yearStats[v.year] > maxYearCount)
			maxYearCount = yearStats[v.year]; 
		
		if (v.year > maxYear)
			maxYear = v.year;
		
		if (v.year < minYear)
			minYear = v.year;
	});
			
	for (let i = minYear; i <= maxYear; i++) {
		if (yearStats[i]) {
			yearEntries.push({
				year: i,
				gap: false,
				total: yearStats[i],
				current: yearStats[i]
			});
		}
	}
	
	// Detect the gaps between year entries
	// While the long gaps should be filled with special elements, short gaps should be filled with empty years
	let gaps = [];
	for (let i = 1; i < yearEntries.length; i++) {
		if (yearEntries[i].year - yearEntries[i-1].year >= YEAR_GAP_THRESHOLD) {
			gaps.push({
				year: yearEntries[i-1].year + 1,
				gap: true,
				duration: yearEntries[i].year - yearEntries[i-1].year - 1
			})
		} else if (yearEntries[i].year - yearEntries[i-1].year > 1) {
			for (let j = yearEntries[i-1].year + 1; j < yearEntries[i].year; j++) {
				gaps.push({
					year: j,
					gap: false,
					total: 0,
					current: 0
				});
			}	
		}
	}
	
	// Update the time chart data with gaps
	for (let i = 0; i < gaps.length; i++) {
		for (let j = 0; j < yearEntries.length; j++) {
			if (yearEntries[j].year > gaps[i].year) {
				yearEntries.splice(j, 0, gaps[i]);
				break;
			}
		}
	}
	
	// Finally, return the data and statistics
	return { timeChartData: yearEntries,
			 maxYearCount: maxYearCount };
}


// Renders the bar chart with statistics per year
function renderTimeChart() {
	// Prepare the chart data
	let chartData = prepareTimeChartData();
	timeChartData = chartData.timeChartData;
		
	// Setup SVG canvas
	let margin = { top: 1, right: 1, bottom: 1, left: 1};
	
	let outerWidth = Math.round($("#timeChart").width());
	let outerHeight = Math.round($("#timeChart").height());
	
	let canvasHeight = outerHeight - margin.top - margin.bottom;
	let canvasWidth = outerWidth - margin.left - margin.right;
	
	timeChartSvg = d3.select($("#timeChart").get(0)).append("svg:svg")
	.attr("id", "timeChartSvg")
	.classed("svg-vis", true)
	.attr("height", outerHeight + "px")
	.attr("width", outerWidth + "px")
	.attr("clip", [margin.top, outerWidth - margin.right, outerHeight - margin.bottom, margin.left].join(" "));
	
	timeChartSvg.append("rect")
	.classed("svg-fill", true)
	.attr("height", outerHeight)
	.attr("width", outerWidth)
	.style("fill", "white");
	
	timeChartSvg.append("rect")
	.classed("svg-frame-rect", true)
	.attr("height", outerHeight)
	.attr("width", outerWidth)
	.style("fill", "none")
	.style("stroke", "grey")
	.style("stroke-width", "1");
	
	let frame = timeChartSvg.append("g")
		.classed("frame-vis", true)
		.attr("id", "timeChartFrame")
		.attr("transform", "translate(" + margin.left + "," + margin.top + ")");
	
	// Prepare the clipping path for inner canvas
	frame.append("clipPath")
		.attr("id", "timeChartCanvasClip")
	.append("rect")
	    .attr("x", 0)
	    .attr("y", 0)
	    .attr("width", canvasWidth)
	    .attr("height", canvasHeight);
	
	let canvas = frame.append("g")
		.classed("canvas-vis", true)
		.attr("id", "timeChartCanvas")
		.attr("clip-path", "url(#timeChartCanvasClip)");
	
	// References to scales should be reused
	timeChartXScale = d3.scale.ordinal()
		.domain(timeChartData.map(function(d){return d.year;}))
		.rangeBands([0, canvasWidth]);
	
	timeChartHeight = canvasHeight;
	
	timeChartYScale = d3.scale.linear()
		.domain([0, chartData.maxYearCount])
		.range([0, timeChartHeight]);
	
	// Add the bars
	canvas.selectAll("g.time-chart-entry")
	.data(timeChartData)
	.enter().append("g")
	.classed("time-chart-entry", true)
	.classed("not-gap", function(d){return !d.gap;})
	.attr("transform", function(d){ return "translate(" + timeChartXScale(d.year) + ",0)"; })
	.attr("title", getTimeChartEntryDescription)
	.each(function(d, i){
		let group = d3.select(this);
		
		if (!d.gap) {
			// Create bars
			group.append("rect")
				.classed("time-chart-total", true)
				.attr("width", timeChartXScale.rangeBand())
				.attr("y", timeChartHeight - timeChartYScale(d.total))
				.attr("height", timeChartYScale(d.total));
		
			group.append("rect")
				.classed("time-chart-current", true)
				.attr("width", timeChartXScale.rangeBand())
				.attr("y", timeChartHeight - timeChartYScale(d.current))
				.attr("height", timeChartYScale(d.current));
			
		} else {
			// Create an ellipsis mark
			group.append("text")
				.classed("time-chart-gap", true)
				.text("…")
				.attr("x", timeChartXScale.rangeBand()/2)
				.attr("y", timeChartHeight/2)
				.attr("text-anchor", "middle");
		}
		
	});
}

// Creates the text description for a time chart entry
function getTimeChartEntryDescription(entry){
	if (!entry.gap) {
		return entry.year + ": "
			+ entry.current + " entries displayed, "
			+ entry.total + " entries in total";
	} else {
		return null;
	}
}

// Updates the set of displayed entries based on current filter values
function updateDisplayedEntries(){
	let container = $("#entriesContainer");
	container.empty();
	
	// Also, remove the tooltips
  $(".tooltip").remove();
	
	// Get the set of active filters
	let activeFilters = {};
	$(".category-entry.active:not(.category-other)").each(function(){
		let category = $(this).data("entry");
		let parent = categoriesMap[category].parentCategory;
		if (!activeFilters[parent])
			activeFilters[parent] = [];
		 
		activeFilters[parent].push(category);
	});
		
	// Get the set of inactive filters for "Other" buttons
	let inactiveOthers = [];
	$(".category-other:not(.active)").each(function(){
		inactiveOthers.push($(this).data("category"));
	});
	
	// Get the set of active free-text category filters
	let activeFreeTextCategoryFilters = [];
	$(".free-text-category-item").each(function(){
		let element = $(this);

		let freeTextCategory =  element.data("category");
		if (element.find("input:checkbox").prop("checked")) {
			activeFreeTextCategoryFilters.push(freeTextCategory);
		}
	});

	// Get the time filter range
	let indices = $("#timeFilter").val();
	let yearMin = timeFilterEntries[parseInt(indices[0])];
	let yearMax = timeFilterEntries[parseInt(indices[1])];
		
	// Filter the entries and sort the resulting array
	let eligibleEntries = $.map(entriesMap, function(entry, index){
		// First of all, check for search text relevancy
		if (!isRelevantToSearch(entry))
			return null;
		
		// Check the time value
		if (entry.year < yearMin || entry.year > yearMax)
			return null;
		
		// Check if the entry is not missing required free text details
		for (let k of activeFreeTextCategoryFilters) {
			if (!entry[k] || !entry[k].length)
				return null;
		}

		// Check if the entry is not relevant to inactive "other" filters
		for (let i = 0; i < entry.incompleteCategories.length; i++) {
			if (inactiveOthers.indexOf(entry.incompleteCategories[i]) != -1)
				return null;
		}
		
		// Check if all entry's categories are disabled
		for (let k in entry.categoriesMap) {
			if (!activeFilters[k] || !activeFilters[k].length)
				return null;
			
			let found = false;
			for (let i = 0; i < entry.categoriesMap[k].length; i++) {
				if (activeFilters[k].indexOf(entry.categoriesMap[k][i]) != -1) {
					found = true;
					break;
				}
			}
			
			if (!found)
				return null;
		}
		
		return entry;
	});
	
	// Sort the entries by year in descending order,
	// entries without proper year value come last.
	// Secondary sorting field is reference (in ascending order).
	eligibleEntries.sort(function(d1, d2){
		return d1.sortIndex - d2.sortIndex;
	});
		
	if (!eligibleEntries.length) {
		container.append("<p class=\"text-muted\">No eligible survey entries found</p>");
	} else {
		$.each(eligibleEntries, function(i,d){
			let element = $("<div class=\"content-entry\" data-tooltip=\"tooltip\"></div>");
			element.attr("data-id", d.id);
			element.prop("title", d.title + " (" + d.year + ")");
			
			let image = $("<img class=\"media-object thumbnail100\">");
			image.attr("src", d.thumb100.src);
			
			element.append(image);
			
			container.append(element);
		});
	}
	
	currentlyDisplayedEntries = eligibleEntries;

	updateDisplayedCount();
	
	updateTimeChart(eligibleEntries);
}


// Updates the time chart
function updateTimeChart(eligibleEntries) {

	// Update the time chart
	let yearStats = {};
	$.each(eligibleEntries, function(i,d){
		if (!yearStats[d.year])
			yearStats[d.year] = 0;
		
		yearStats[d.year] += 1;
	});
	
	$.each(timeChartData, function(i, d){
		if (d.gap)
			return;
		
		d.current = yearStats[d.year] || 0;
	});
	
	timeChartSvg.selectAll("g.time-chart-entry.not-gap")
	.each(function(d, i){
		if (d.gap)
			return;
		
		let group = d3.select(this);
		
		group.select(".time-chart-current")
			.transition()
				.attr("y", timeChartHeight - timeChartYScale(d.current))
				.attr("height", timeChartYScale(d.current));
		
		group.attr("title", getTimeChartEntryDescription(d));
		// Force Bootstrap tooltip update
		group.attr("data-original-title", getTimeChartEntryDescription(d));
	});
}


// Checks if current entry is relevant to the current search text
function isRelevantToSearch(entry){
	let query = searchText ? searchText.toLowerCase().trim() : null;
	if (!query)
		return true;
	
	// Note: "allAuthors" should be included in order to support alternative name spellings
	let keys = ["id", "title", "year", "authors", "allAuthors", "references", "urls", "categories"];
	for (let i = 0; i < keys.length; i++) {
		if (String(entry[keys[i]]).toLowerCase().indexOf(query) != -1) {
			return true;
		}
	}
	
	// Check the category descriptions as well
	for (let i = 0; i < entry.categories.length; i++){
		if (categoriesMap[entry.categories[i]].description.toLowerCase().indexOf(query) != -1) {
			return true;
		}
	}

	// Check the free text details as well
	for (let k in freeTextCategoriesMap) {
		if (entry[k] && entry[k].toLowerCase().indexOf(query) != -1) {
			return true;
		}
	}
	
	return false;
}

// Validates the new entry form and creates a JSON entry file
function onAddEntry(){
	if (!validateEntryForm())
		return;
	
	// Create an object
	let entry = {};
	
	if ($("#inputEntryTitle").val())
		entry.title = $("#inputEntryTitle").val();
	
	if ($("#inputEntryYear").val())
		entry.year = $("#inputEntryYear").val();
		
	if ($("#inputEntryAuthors").val())
		entry.authors = $("#inputEntryAuthors").val();
	
	if ($("#inputEntryReference").val())
		entry.reference = $("#inputEntryReference").val();
	
	if ($("#inputEntryUrl").val())
		entry.url = $("#inputEntryUrl").val();
	
	entry.categories = [];
	$("#inputEntryCategories").find("button.active").each(function(){
		if ($(this).attr("data-entry"))
			entry.categories.push($(this).attr("data-entry"));
	});
	
	$("#addEntryModal").modal("hide");
	
	// Create a blob for downloading
	exportBlob(JSON.stringify(entry), "application/json");
}

// Validates the new entry form
function validateEntryForm(){
	let isValid = true;
	
	$("#addEntryModal form .form-group").each(function(){
		let element = $(this);
		
		if (element.find("input.form-control.form-mandatory").length){
			if (!element.find("input.form-control.form-mandatory").first().val()) {
				isValid = false;
				element.removeClass("has-success").addClass("has-error");
			} else {
				element.removeClass("has-error").addClass("has-success");
			}
		}
		
		if (element.find("#inputEntryCategories").length){
			if (!$("#inputEntryCategories").find("button.active").length) {
				isValid = false;
				element.removeClass("has-success").addClass("has-error");
			} else {
				element.removeClass("has-error").addClass("has-success");
			}
		}
			
	});
	
	return isValid;
}

// Renders the statistics diagram
function onAboutModalShown(){
	$("#statsContainer").empty();
	
	let minWidth = 6;
	let totalCount = Object.keys(entriesMap).length;
	
	// Iterate through a number of colors - should be sufficient
	// for even very extensive categorizations
	// (not the best solution for >8 colors, of course, but this will have to do...)
	let color = d3.scale.ordinal()
    .range([].concat(colorbrewer.Dark2[8], colorbrewer.Set3[12]));
	
	let trimToLength = function(string, length){
		let padding = "...";
		
		if (string.length <= length - padding.length)
			return string;
		else
			return string.substring(0, length - padding.length) + padding;
	};
	
	// It seems that the width values returned by the browser are not reliable,
	// so simply account for the nested level manually
	// XXX: the code calculating these width values is currently a terrible
	// black magic hack, but it works. It would be much better to simply
	// do it with SVG, but it would be tricky to use glyph symbols.
	
	let processCategory = function(category, container, nestedLevel){
		if (category.children)
			$.each(category.children, function(i, d){
				let currentContainer = container;
				
				if (d.children) {
					let newContainer = $("<div class=\"diagram-category-container\"></div>");
					newContainer.attr("data-category", d.title);
					container.append(newContainer);
					currentContainer = newContainer;
				}
				
				let row = $("<div class=\"diagram-row\"></div>");
				row.attr("title", d.description + ": " + d.value + " relevant survey entries");
				row.attr("data-category", d.title);
				currentContainer.append(row);
				
				// Check if category title should be included
				if (d.children) {
					row.addClass("diagram-category-row");
					
					// Add a description into a separate div
					let divCategoryTitle = $("<div class=\"diagram-category-title\"></div>");
					divCategoryTitle.text(trimToLength(d.description, 40));
					row.append(divCategoryTitle);
				}
				
				// The actual row container for icon and bar
				let rowContent = $("<div class=\"diagram-row-content\"></div>");
				row.append(rowContent);
				
				// Check if category title should be included
				let barTitle = $("<span class=\"bar-title\"></span>");
				if (d.children) {
					// Use the element as a placeholder with fixed width
					barTitle.addClass("bar-icon-placeholder");	
				} else {
					// Use the element as an icon
					barTitle.addClass("bar-icon");
					barTitle.append(categoriesMap[d.title].content);
				}
				rowContent.append(barTitle);
				
				let outerContainerWidth = Math.floor(parseFloat($("#statsContainer").innerWidth()));
				let maxWidth = outerContainerWidth
					- Math.ceil(parseFloat(barTitle.css("width"))) - Math.ceil(parseFloat(barTitle.css("margin-right")));
				if (d.children) {
					maxWidth -= 10 * (nestedLevel + 2);
				} else {
					maxWidth -= 10 * nestedLevel;
				}
												
				let width = Math.floor(minWidth + (maxWidth - minWidth) * (d.value * 1.0 / totalCount));
								
				let bar = $("<div class=\"diagram-bar\"></div>");
				rowContent.append(bar);
				
				bar.css("width",  width + "px");
				bar.css("background", color(d.topCategory));

				//console.log(`Background color lightness for ${d.topCategory}: ${d3.hcl(color(d.topCategory)).l}`)
					
				let barValue = $("<span class=\"bar-value\"></span>");
				barValue.text(d.value);

				// Check if the white font color should be used against a darker background bar
				if (d3.hcl(color(d.topCategory)).l <= 56)
					barValue.css("color", "white");

				bar.append(barValue);	
				
				// Recursively process children
				processCategory(d, currentContainer, nestedLevel + 2);

				// Check the stats for free-text details
				if (freeTextStatsMap[d.title+"-details"]) {
					let freeTextStatsEntry = freeTextStatsMap[d.title+"-details"];

					let freeTextCount = Object.keys(freeTextStatsEntry.ids).length;

					// console.log("Parent category: " + d.title + " (" + d.value + ")", 
					// 	"free text category: " + freeTextStatsEntry.title + "(" + freeTextCount + ")")

					let freeTextRow = $("<div class=\"diagram-row diagram-free-text-category-row\"></div>");
					freeTextRow.attr("title", freeTextStatsEntry.description + ": provided for " + freeTextCount + " survey entries");
					freeTextRow.attr("data-free-text-category", freeTextStatsEntry.title);
					currentContainer.append(freeTextRow);

					// The actual row container for icon and bar
					let freeTextRowContent = $("<div class=\"diagram-row-content\"></div>");
					freeTextRow.append(freeTextRowContent);

					let freeTextBarTitle = $("<span class=\"bar-title bar-free-text-category-indicator\">Details:</span>");
					freeTextRowContent.append(freeTextBarTitle);

					let freeTextBarWidth = Math.floor(minWidth + (maxWidth - minWidth) * (freeTextCount * 1.0 / totalCount));

					let freeTextBar = $("<div class=\"diagram-bar\"></div>");
					freeTextRowContent.append(freeTextBar);

					freeTextBar.css("width",  freeTextBarWidth + "px");
					freeTextBar.css("background", 
						"repeating-linear-gradient(-45deg, "
						 + color(d.topCategory) + ", " + color(d.topCategory) + " 10px,"
						 + "gray 10px, gray 20px)");

					let freeTextBarValue = $("<span class=\"bar-value\"></span>");
					freeTextBarValue.text(freeTextCount);

					// Check if the white font color should be used against a darker background bar
					if (d3.hcl(color(d.topCategory)).l <= 56)
						freeTextBarValue.css("color", "white");

					freeTextBar.append(freeTextBarValue);

				}
			});
		
	};
	
	processCategory(stats, $("#statsContainer"), 2);
}

// Exports the provided blob data
// Currently used for exporting the new entry data (and for some internal analyses)
function exportBlob(blobData, type){
	let blob = new Blob([blobData], {"type":type});
    let link = window.URL.createObjectURL(blob);
    
    window.open(link, "_blank");
    
	setTimeout(function(){
		window.URL.revokeObjectURL(link);
	}, 10000);
}

// Configures the time filter
function configureTimeFilter() {
	// Get the set of time values
	let values = {};
	$.each(entriesMap, function(i, d){
		if (!isFinite(parseInt(d.year)))
			return;
		
		values[d.year] = true;
	});
	
	// Get the range of time values
	timeFilterEntries = $.map(values, function(d, i){
		return parseInt(i);
	}).sort(function(a, b) {
		  return a - b;
	});
	
	// Update labels
	$("#timeFilterMin").text(timeFilterEntries[0]);
	$("#timeFilterMax").text(timeFilterEntries[timeFilterEntries.length-1]);
	
	// Setup the slider
	$("#timeFilter").noUiSlider({
		start: [0, timeFilterEntries.length-1],
		step: 1,
		range: {
			"min": 0,
			"max": timeFilterEntries.length-1
		},
		behaviour: "drag",
		connect: true
	}).on("slide", onTimeFilterUpdate);
}

// Updates the labels and triggers time filtering
function onTimeFilterUpdate() {
	let indices = $("#timeFilter").val();
	
	$("#timeFilterMin").text(timeFilterEntries[parseInt(indices[0])]);
	$("#timeFilterMax").text(timeFilterEntries[parseInt(indices[1])]);
	
	updateDisplayedEntries();
}

// Populates the summary table
function populateSummaryTable() {
	let container = $("#summaryTableContainer");
	container.empty();
	
	// Create the ordered list of categories
	let categoriesList = [];
	$.each(categoriesMap, function(i, d){
		if (d.type == "category-entry"
			&& !d.disabled)
			categoriesList.push(i);
	});
	categoriesList.sort(categoriesComparator);
	
	// Create the table
	let table = $("<table class=\"table table-bordered table-hover\"></table>");
		
	// Create the header row
	let tableHead = $("<thead></thead>");
	let headerRow = $("<tr></tr>");
	headerRow.append("<th>Entry</th>");
		
	$.each(categoriesList, function(i,d){
		let item = categoriesMap[d];
		
		let element = $("<span class=\"category-entry \""
			    + "data-tooltip=\"tooltip\"></span>");
		element.prop("title", item.descriptionPrefix
				? item.descriptionPrefix + item.description
				: item.description);
		element.append(item.content);
		
		let cell = $("<th class=\"category-cell\"></th>");
		cell.append(element);
		headerRow.append(cell);
	});
	tableHead.append(headerRow);
	table.append(tableHead);
	
	// Get the list of entries sorted by year in increasing order
	let entriesList = $.map(entriesMap, function(d){return d;});
	entriesList.sort(function(d1, d2){
		return d2.sortIndex - d1.sortIndex;
	});
		
	// Create the table body
	let tableBody = $("<tbody></tbody>");
	$.each(entriesList, function(i, d){
		let row = $("<tr></tr>");
		
		// Add the technique title
		row.append("<td class=\"technique-cell\">"
				+ "<span class=\"summary-entry-link-wrapper\">"
				+ "<a href=\"#\" data-id=\"" + d.id + "\" class=\"summary-entry-link\" "
				+ "title=\"" + d.title + " by " + d.authors + " (" + d.year + ")" + "\""
				+ ">" + d.title + " (" + d.year + ")"
				+ "</a>" + "</span>" + "</td>");
				
		// Prepare the set of technique's categories for further lookup
		let hasCategory = {};
		for (let j = 0; j < d.categories.length; j++){
			hasCategory[d.categories[j]] = true;
		}
		
		// Iterate over the general list of categories and append row cells
		for (let j = 0; j < categoriesList.length; j++){
			let cell = $("<td class=\"category-cell\"></td>");
			
			if (hasCategory[categoriesList[j]]) {
				let item = categoriesMap[categoriesList[j]];
				
				cell.addClass("category-present");
				cell.attr("data-tooltip", "tooltip");
				cell.prop("title", item.descriptionPrefix
						? item.descriptionPrefix + item.description
						: item.description);
			}
			
			row.append(cell);
		}
		
		tableBody.append(row);
	});
		
	table.append(tableBody);
		
	// Insert the table into the modal
	container.append(table);
	
	// Setup the handler for links
	table.on("click", ".summary-entry-link", onSummaryEntryLinkClick);
}

// Handles the click on a summary entry link
function onSummaryEntryLinkClick(){
	// Close the summary dialog
	$("#summaryTableModal").modal("hide");
	
	// Emulate the effects of a closed details dialog
	onDetailsModalHidden();
		
	// Get the ID of the entry link
	let id = $(this).data("id");
	
	// Trigger the usual handler
	displayEntryDetails(id);
			
	// Return false to prevent the default handler for hyperlinks
	return false;
}

// Computes the coauthorship graph, etc.
function analyseContent(){
	// Ignore the analysis in regular mode
	let authorStats = computeAuthorshipStatistics();
	
	let coauthorshipGraph = constructCoauthorshipGraph(authorStats);
	exportBlob(exportCoauthorshipGraphGML(coauthorshipGraph, authorStats), "text/plain");
//	//exportBlob(exportCoauthorshipGraphGV(coauthorshipGraph, authorStats), "text/plain");
	
//	// Invoke auxiliary functions, if necessary
//	if (typeof printSummaryTableLatex == "function") {
//		printSummaryTableLatex();
//	}
//	if (typeof printSummaryMatrix == "function") {
//		printSummaryMatrix();
//	}
//	if (typeof printTemporalMatrix == "function") {
//		printTemporalMatrix();
//	}
}

// // Computes the basic authorship statistics
// function computeAuthorshipStatistics(){
	// let authorStats = {};
	
	// $.each(entriesMap, function(i, d){
	// 	$.each(d.allAuthors, function(j, e){
	// 		// Create a new entry, if necessary
	// 		if (authorStats[e] == undefined)
	// 			authorStats[e] = 0;
			
	// 		authorStats[e] += 1;
	// 	});
	// });
	
	// List the author names to make sure they are properly normalized
	// console.log("The ordered list of normalized author names:");
	// console.log(Object.keys(authorStats).sort());
	
	// let sortedStats = $.map(authorStats, function(v, k){
	// 	return { name: k, count: v };
	// }).sort(function(a, b){
	// 	let compCount =  b.count - a.count;
		
	// 	if (compCount != 0)
	// 		return compCount;
		
	// 	return a.name.localeCompare(b.name);
	// });
	
	// console.log("Authorship statistics:");
	// console.log($.map(sortedStats, function(stat, i){
	// 	return [stat.name, stat.count];
	// }));
	
	// Additionally, count the distribution for these results
	// let authorStatBins = {};
	// $.each(authorStats, function(v, k){
	// 	if (authorStatBins[k] == undefined)
	// 		authorStatBins[k] = 0;
		
	// 	authorStatBins[k] += 1;
	// });

	//console.log("Authorship statistics distribution:");
	//console.log(authorStatBins);
	
	
// 	return authorStats;
// }

// // Constructs a coauthorship graph
// function constructCoauthorshipGraph(){
// 	// A map of names to node IDs
// 	let nodes = {};
// 	// A map of source IDs to sets of target IDs
// 	// (stored as ID-weight map)
// 	let edges = {};
		
// 	$.each(entriesMap, function(i, d){
// 		$.each(d.allAuthors, function(j, e){
// 			// Create a new node, if necessary
// 			if (nodes[e] == undefined)
// 				nodes[e] = Object.keys(nodes).length;
			
// 			// Process coauthors
// 			$.each(d.allAuthors, function(k, f){
// 				if (e.localeCompare(f) == 0)
// 					return;
				
// 				// Create a new node for coauthor, if necessary
// 				if (nodes[f] == undefined)
// 					nodes[f] = Object.keys(nodes).length;
				
// 				// Ignore the duplicate edges (consider only edges from smaller to larger IDs)
// 				if (nodes[f] < nodes[e])
// 					return;
				
// 				// Create a new edge
// 				let source = nodes[e];
// 				let target = nodes[f];
				
// 				if (edges[source] == undefined)
// 					edges[source] = {};
					
// 				// Increment (or initialize) the weight value
// 				edges[source][target] = (edges[source][target] || 0) + 1;	
// 			});
// 		});
// 	});
	
// 	return { nodes: nodes, edges: edges };
// }

// //Exports a GML file for the coauthorship graph
// function exportCoauthorshipGraphGML(coauthorshipGraph, authorStats){
// 	let result = "graph [\n";
// 	result += "directed 0\n";
	
// 	$.each(coauthorshipGraph.nodes, function(name, id){
// 		result += "node [\n";
// 		result += "id " + id + "\n";
// 		result += "weight " + authorStats[name] + "\n";
// 		result += "label \"" + name + " (" + authorStats[name] + ")" + "\"\n";
// 		result += "]\n";
// 	});
	
// 	$.each(coauthorshipGraph.edges, function(source, targets){
// 		$.each(targets, function(target, weight){
// 			result += "edge [\n";
// 			result += "source " + source + "\n";
// 			result += "target " + target + "\n";
// 			result += "weight " + weight + "\n";
// 			result += "label \"" + weight + "\"\n";
// 			result += "]\n";
// 		});
// 	});
	
// 	result += "]\n";
	
// 	return result;
// }

////Exports a DOT/GV file for the coauthorship graph
//function exportCoauthorshipGraphGV(coauthorshipGraph, authorStats){
//	let result = "graph {\n";
//		
//	$.each(coauthorshipGraph.nodes, function(name, id){
//		result += id + " [\n";
//		result += "weight=" + authorStats[name] + ",\n";
//		result += "label=\"" + name + " (" + authorStats[name] + ")" + "\"\n";
//		result += "];\n";
//	});
//	
//	$.each(coauthorshipGraph.edges, function(source, targets){
//		$.each(targets, function(target, weight){
//			result += source + " -- " + target + " [\n";
//			result += "weight=" + weight + ",\n";
//			result += "label=\"" + weight + "\"\n";
//			result += "];\n";
//		});
//	});
//	
//	result += "}\n";
//	
//	return result;
//}

//// Auxiliary function based on populateSummaryTable
//// which is used to generate the corresponding Latex table code for the survey paper
//function printSummaryTableLatex() {
//	// Create the ordered list of categories
//	let categoriesList = [];
//	$.each(categoriesMap, function(i, d){
//		if (d.type == "category-entry"
//			&& !d.disabled)
//			categoriesList.push(i);
//	});
//	// Instead of a regular order, use the one from the article
//	let overridenIndices = {
//			"social-media": -100,
//			"communication": -99,
//			"patents": -98,
//			"reviews": -97,
//			"literature": -96,
//			"papers": -95,
//			"editorial-media": -94,
//			
//			"document": -93,
//			"corpora": -92,
//			"streams": -91,
//			
//			"geospatial": -90,
//			"time-series": -89,
//			"networks": -88
//	};
//	
//	categoriesList.sort(function(d1, d2){
//		let i1 = overridenIndices[d1] || categoriesIndices[d1];
//		let i2 = overridenIndices[d2] || categoriesIndices[d2];
//		
//		return i1 - i2;
//	});
//	
//	// Create the table configuration
//	let result = "\\begin{tabular}{|l|";
//	$.each(categoriesList, function(i,d){
//		result += "c|";
//	});
//	result += "}\n";
//	
//	// Create the table header
//	result += "\\hline \\textbf{Entry} ";
//	$.each(categoriesList, function(i,d){
//		result += "& " + "\\tableheader{" + categoriesMap[d].description + "}"
//			   + "{" + d + "}" + " ";
//	});
//	result += "\\\\\n";
//		
//	// Get the list of entries sorted by year/author in increasing order
//	let entriesList = $.map(entriesMap, function(d){return d;});
//	entriesList.sort(function(d1, d2){
//		if (d1.year - d2.year)
//			return d1.year - d2.year;
//		
//		return d1.id.localeCompare(d2.id);
//	});
//		
//	// Use specific values for certain IDs - make sure to include all IDs with underscore here!
//	let specials = {
//	};
//	
//	// Create the table body
//	$.each(entriesList, function(i, d){
//		result += "\\hline ";
//		if (d.id in specials) {
//			result += specials[d.id];
//		} else {
//			result += "\\cite{" + d.id.replace(/_.*$/, "") + "}";
//			
//			if (/_.*$/.test(d.id)) {
//				console.log("Note! " + d.id + " replaced to " + d.id.replace(/_.*$/, ""));
//			}
//		}
//		result += " ";
//		
//		// Prepare the set of technique's categories for further lookup
//		let hasCategory = {};
//		for (let j = 0; j < d.categories.length; j++){
//			hasCategory[d.categories[j]] = true;
//		}
//		
//		// Iterate over the general list of categories and append row cells
//		for (let j = 0; j < categoriesList.length; j++){
//			result += "& ";
//			
//			if (hasCategory[categoriesList[j]]) {
//				result += "\\filledcell{} ";
//			}
//			
//		}
//		
//		result += "\\\\\n";
//	});
//	
//	result += "\\hline\n";
//	result += "\\end{tabular}";
//
//	console.log(result);
//}

//// Auxiliary function based on printSummaryTableLatex
//// which is used to generate the matrix for category correlation analysis
//function printSummaryMatrix() {
//	// Create the ordered list of categories
//	let categoriesList = [];
//	$.each(categoriesMap, function(i, d){
//		if (d.type == "category-entry"
//			&& !d.disabled)
//			categoriesList.push(i);
//	});
//	// Instead of a regular order, use the one from the article
//	let overridenIndices = {
//			"social-media": -100,
//			"communication": -99,
//			"patents": -98,
//			"reviews": -97,
//			"literature": -96,
//			"papers": -95,
//			"editorial-media": -94,
//			
//			"document": -93,
//			"corpora": -92,
//			"streams": -91,
//			
//			"geospatial": -90,
//			"time-series": -89,
//			"networks": -88
//	};
//	
//	categoriesList.sort(function(d1, d2){
//		let i1 = overridenIndices[d1] || categoriesIndices[d1];
//		let i2 = overridenIndices[d2] || categoriesIndices[d2];
//		
//		return i1 - i2;
//	});
//	
//	// Create the header row
//	let result = categoriesList.join(",") + "\n";
//		
//	// Get the list of entries sorted by year/author in increasing order
//	let entriesList = $.map(entriesMap, function(d){return d;});
//	entriesList.sort(function(d1, d2){
//		if (d1.year - d2.year)
//			return d1.year - d2.year;
//		
//		return d1.id.localeCompare(d2.id);
//	});
//	
//	// Create the matrix body
//	$.each(entriesList, function(i, d){		
//		// Prepare the set of technique's categories for further lookup
//		let hasCategory = {};
//		for (let j = 0; j < d.categories.length; j++){
//			hasCategory[d.categories[j]] = true;
//		}
//		
//		// Iterate over the general list of categories and append matrix values
//		for (let j = 0; j < categoriesList.length; j++){
//			if (j > 0)
//				result += ",";
//			
//			result += (hasCategory[categoriesList[j]]) ? "1" : "0";
//		}
//		
//		result += "\n";
//	});
//	
//	result += "\n";
//
//	console.log(result);
//}

//// Auxiliary function based on printSummaryTableLatex
//// which is used to generate the matrix for temporal category analysis
//function printTemporalMatrix() {	
//	// Create the ordered list of categories
//	let categoriesList = [];
//	$.each(categoriesMap, function(i, d){
//		if (d.type == "category-entry"
//			&& !d.disabled)
//			categoriesList.push(i);
//	});
//	// Instead of a regular order, use the one from the article
//	let overridenIndices = {
//			"social-media": -100,
//			"communication": -99,
//			"patents": -98,
//			"reviews": -97,
//			"literature": -96,
//			"papers": -95,
//			"editorial-media": -94,
//			
//			"document": -93,
//			"corpora": -92,
//			"streams": -91,
//			
//			"geospatial": -90,
//			"time-series": -89,
//			"networks": -88
//	};
//	
//	categoriesList.sort(function(d1, d2){
//		let i1 = overridenIndices[d1] || categoriesIndices[d1];
//		let i2 = overridenIndices[d2] || categoriesIndices[d2];
//		
//		return i1 - i2;
//	});
//	
//	// Calculate the temporal statistics
//	let bins = {};
//	let yearStats = {};
//	let minYear = 1e6;
//	let maxYear = -1e6;
//		
//	$.each(entriesMap, function(i, d){
//		if (!yearStats[d.year])
//			yearStats[d.year] = 0;
//		yearStats[d.year]++;
//		
//		if (d.year > maxYear)
//			maxYear = d.year;
//		
//		if (d.year < minYear)
//			minYear = d.year;
//		
//		if (bins[d.year] == undefined) {
//			bins[d.year] = {};
//		}
//		
//		for (let j = 0; j < d.categories.length; j++){
//			let category = d.categories[j];
//			
//			if (bins[d.year][category] == undefined) {
//				bins[d.year][category] = 0;
//			}
//			bins[d.year][category]++;
//		}
//	});
//	
//	
//	// Create the header row
//	let result = "Year," + categoriesList.join(",") + "\n";
//	
//	// Create the matrix body
//	for (let year = minYear; year <= maxYear; year++) {
//		result += year + ",";
//		
//		let totalValue = yearStats[year];
//		
//		// Iterate over the general list of categories and append matrix values
//		for (let j = 0; j < categoriesList.length; j++){
//			let category = categoriesList[j];
//			
//			if (totalValue == 0) {
//				result += 0;
//			} else if (bins[year] == undefined ||  bins[year][category] == undefined) {
//				result += 0;
//			} else {
//				result += (100 * bins[year][category] / totalValue).toFixed(2);
//			}
//			
//			if (j < categoriesList.length - 1)
//				result += ",";
//		}
//		
//		result += "\n";		
//	}
//		
//	result += "\n";
//	
//	console.log(result);
//}

