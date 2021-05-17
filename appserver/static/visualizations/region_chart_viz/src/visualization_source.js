// TODO would be good to stop the lines (etc) from extending outside the canvas and over the axis
// TODO could regions be coloured as gradients?
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils',
    'jquery',
    'd3',
    'tinycolor2'
],
function(
    SplunkVisualizationBase,
    vizUtils,
    $,
    d3,
    tinycolor
) {
    var vizObj = {
        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            var viz = this;
            viz.instance_id = "region_chart_viz_" + Math.round(Math.random() * 1000000);
            viz.instance_id_ctr = 0;
            viz.theme = 'light'; 
            if (typeof vizUtils.getCurrentTheme === "function") {
                viz.theme = vizUtils.getCurrentTheme();
            }
            viz.colors = ["#006d9c", "#4fa484", "#ec9960", "#af575a", "#b6c75a", "#62b3b2"];
            if (typeof vizUtils.getColorPalette === "function") {
                viz.colors = vizUtils.getColorPalette("splunkCategorical", viz.theme);
            }
            viz.$container_wrap = $(viz.el);
            viz.$container_wrap.addClass("region_chart_viz-container");
        },

        formatData: function(data) {
            return data;
        },

        updateView: function(data, config) {
            var viz = this;
            viz.config = {
                type: "curve",
                nulls: "gap",
                last_text: "hide",
                summ_text: "hide",
                xtitle_show: "hide",
                xtitle_text: "",
                ytitle_show: "hide",
                status_dots: "hide",
                ytitle_text: "",
                multi_series: "shaded",
                line_size: "3",
                shadow: "0",
                line_color: "#000000",
                min: "",
                max: "",
                text_precision: "-1",
                text_thousands: "no",
                text_unit: "",
                text_unit_position: "after",
                region_opacity: "35",
                region_comparison: "",
                color_critical: "#B50101",
                color_high: "#F26A35",
                color_medium: "#FCB64E",
                color_low: "#FFE98C",
                color_normal: "#99D18B",
                color_info: "#AED3E5",
                transition_time: "1000",
                row_limit: "5000",
                scaleregion: "no"
            };
            // Override defaults with selected items from the UI
            for (var opt in config) {
                if (config.hasOwnProperty(opt)) {
                    viz.config[ opt.replace(viz.getPropertyNamespaceInfo().propertyNamespace,'') ] = config[opt];
                }
            }
            viz.data = data;
            viz.scheduleDraw();
        },
        
        getSeverityColor: function(sev){
            var viz = this;
            return sev==="critical" ? viz.config.color_critical 
                    : sev==="high" ? viz.config.color_high
                    : sev==="medium" ? viz.config.color_medium 
                    : sev==="low" ? viz.config.color_low 
                    : sev==="normal" ? viz.config.color_normal 
                    : sev==="info" ? viz.config.color_info
                    // Assume a colour has been provided. 
                    : sev; 
        },

        formatWithPrecision: function(val){
            var viz = this;
            var ret;
            if (viz.config.text_precision === "1") {
                ret = Math.round(val);
            } else if (viz.config.text_precision === "2") {
                ret = Math.round(val * 10) / 10;
            } else if (viz.config.text_precision === "3") {
                ret = Math.round(val * 100) / 100;
            } else if (viz.config.text_precision === "4") {
                ret = Math.round(val * 1000) / 1000;
            } else if (viz.config.text_precision === "5") {
                ret = Math.round(val * 10000) / 10000;
            } else if (viz.config.text_precision === "6") {
                ret = Math.round(val * 100000) / 100000;
            } else {
                ret = val;
            }
            ret = "" + ret;
            if (viz.config.text_thousands === "yes") {
                ret = ret.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
            }
            if (viz.config.text_unit) {
                if (viz.config.text_unit_position === "before") {
                    ret = viz.config.text_unit + " " + ret;
                } else {
                    ret = ret + " " + viz.config.text_unit;
                }
            }
            return ret;
        },

        //create a in-memory div, set it's inner text(which jQuery automatically encodes)
        //then grab the encoded contents back out.  The div never exists on the page.
        htmlEncode: function(value){
            return $('<div/>').text(value).html();
        },

        // debounce the draw
        scheduleDraw: function(){
            var viz = this;
            clearTimeout(viz.drawtimeout);
            viz.drawtimeout = setTimeout(function(){
                viz.doDraw();
            }, 300);
        },

        doDraw: function(){
            var viz = this;

            // Dont draw unless this is a real element under body
            if (! viz.$container_wrap.parents().is("body")) {
                return;
            }
            // Container can have no height if it is in a panel that isnt yet visible on the dashboard.
            // I believe the container might also have no size in other situations too
            if (viz.$container_wrap.height() <= 0) {
                if (!viz.hasOwnProperty("resizeWatcher")) {
                    viz.resizeWatcher = setInterval(function(){
                        if (viz.$container_wrap.height() > 0) {
                            clearInterval(viz.resizeWatcher);
                            delete viz.resizeWatcher;
                            viz.scheduleDraw(in_data, in_config);
                        }
                    }, 1000);
                }
                return;
            }
            if (viz.hasOwnProperty("resizeWatcher")) {
                clearInterval(viz.resizeWatcher);
                delete viz.resizeWatcher;
            }

            if (viz.data.fields.length <= 1) {
                viz.$container_wrap.empty().append("<div class='region_chart_viz-bad_data'>Need at least 2 columns of data.<br /><a href='/app/region_chart_viz/documentation' target='_blank'>Click here for examples and documentation</a></div>");
                return;
            }

            if (viz.data.results.length > (+viz.config.row_limit)) {
                viz.$container_wrap.empty().append("<div class='region_chart_viz-bad_data'>Too many data points (rows=" + viz.data.results.length + ", limit=" + viz.config.row_limit + ")<br /><a href='/app/region_chart_viz/documentation' target='_blank'>Click here for examples and documentation</a></div>");
                return;
            }

            viz.config.containerHeight = viz.$container_wrap.height();
            viz.config.containerWidth = viz.$container_wrap.width();
            var serialised = JSON.stringify(viz.config);
            if (viz.alreadyDrawn === serialised) {
                viz.isFirstDraw = false;
            } else {
                viz.$container_wrap.empty();
                viz.alreadyDrawn = serialised;
                viz.isFirstDraw = true;
                // determine the dimentions
                viz.margin = {top: 10, right: 40, bottom: 30, left: 60};
                if (viz.config.xtitle_show !== "hide") {
                    viz.margin.bottom = 50;
                }
                if (viz.config.ytitle_show !== "hide") {
                    viz.margin.left = 80;
                }
                viz.width = viz.config.containerWidth - viz.margin.left - viz.margin.right;
                viz.height = viz.config.containerHeight - viz.margin.top - viz.margin.bottom;
                viz.overlay_text_size = Math.max(12, Math.min(60, viz.height * 0.06));
            }



            // #################################################################################################################
            //   ____        _                                            _             
            //  |  _ \  __ _| |_ __ _   _ __  _ __ ___   ___ ___  ___ ___(_)_ __   __ _ 
            //  | | | |/ _` | __/ _` | | '_ \| '__/ _ \ / __/ _ \/ __/ __| | '_ \ / _` |
            //  | |_| | (_| | || (_| | | |_) | | | (_) | (_|  __/\__ \__ \ | | | | (_| |
            //  |____/ \__,_|\__\__,_| | .__/|_|  \___/ \___\___||___/___/_|_| |_|\__, |
            //                         |_|                                        |___/ 

            var datamin_y = null;
            var datamax_y = null;
            var regionmin_y = null;
            var regionmax_y = null;
            var line;
            var just_gapped;
            var just_added;
            var statusdotsev;
            var statusdotcolor;
            var summary_total = 0;
            var summary_count = 0;
            var k,m,n,l,sevparts, record, limit_bottom, limit_top, col_width, skips, i, j, d, right, regions_arr, x_record;
            viz.column_names = [];
            viz.lines = [];
            viz.xAxisPositions = [];
            viz.line_data_last = null;
            viz.regions = [];
            viz.all_regions = [];
            for (k = 0; k < viz.data.fields.length; k++) {
                if (viz.data.fields[k].name !== "regions" && (viz.data.fields[k].name.substr(0,1) !== "_" || viz.data.fields[k].name === "_time")) {
                    viz.column_names.push(viz.data.fields[k].name);
                }
            }
            if (viz.column_names.length < 2) {
                viz.column_names.push("");
            }
            if (viz.column_names[0] === "_time") {
                viz.isTimechart = true;
            } else {
                viz.isTimechart = false;
            }
            for (m = 1; m < viz.column_names.length; m++) {
                line = {
                    name: viz.column_names[m],
                    line_data: [],
                    orphan_dots: [],
                    status_dots: []
                };
                viz.lines.push(line);
                if (m === 1) {
                    line.color = viz.config.line_color;
                    line.dash = "";
                } else if (viz.config.multi_series === "shaded") {
                    if (viz.theme === 'light') {
                        line.color = tinycolor(viz.config.line_color).lighten(15 * m).toString();
                    } else {
                        line.color = tinycolor(viz.config.line_color).darken(6 * (m - 1)).toString();
                    }
                    line.dash = (viz.config.line_size * 5) + ", " + (viz.config.line_size * 2);
                } else {
                    line.color = viz.colors[m % viz.colors.length];
                    line.dash = "";
                }
                just_gapped = true;
                just_added = false;
                for (k = 0; k < viz.data.results.length; k++) {
                    // if first field is _time, then treat as a date. this seems to be the logic that normal line chart uses.
                    record = {
                        row: k,
                        idx: (m - 1)
                    };
                    // Only process the regions on the first iteration through
                    if (m === 1) {
                        // save a list of the possible x values for the tooltip
                        x_record = {
                            x: record.x,
                            data: []
                        };
                        viz.xAxisPositions.push(x_record);
                        if (viz.isTimechart) {
                            x_record.x = vizUtils.parseTimestamp(viz.data.results[k][viz.column_names[0]]);
                            x_record.x_fmt = x_record.x.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short',  year: 'numeric', hour:"2-digit", minute:"2-digit", second:"2-digit" });
                        } else {
                            x_record.x = +viz.data.results[k][viz.column_names[0]];
                            x_record.x_fmt = viz.data.results[k][viz.column_names[0]];
                        }
                        viz.regions[k] = {stops: [], sevs: [], colors: []};
                            if (viz.data.results[k].hasOwnProperty("regions") && $.trim(viz.data.results[k].regions) !== "") {
                                regions_arr =  viz.htmlEncode(viz.data.results[k].regions).split(",");
                                if ((regions_arr.length % 2) === 1) {
                                    // only save these if they are valid (1 more severity than stops)
                                    for (l = 0; l < regions_arr.length; l++){
                                        // if its an odd element
                                        if (l % 2 === 1) {
                                            viz.regions[k].stops.push(regions_arr[l]);
                                            if (regionmin_y === null || regionmin_y > regions_arr[l]) {
                                                regionmin_y = + regions_arr[l];
                                            }
                                            if (regionmax_y === null || regionmax_y < regions_arr[l]) {
                                                regionmax_y = + regions_arr[l];
                                            }
                                        } else {
                                            sevparts = regions_arr[l].split("=");
                                            if (sevparts.length === 2) {
                                                viz.regions[k].sevs.push(sevparts[0]);
                                                viz.regions[k].colors.push(sevparts[1]);
                                            } else {
                                                viz.regions[k].sevs.push(regions_arr[l]);
                                                viz.regions[k].colors.push(regions_arr[l]);
                                            }
                                        }
                                    }
                                } else if (regions_arr.lenghh > 0) {
                                    console.log("Line " + (k + 1) + ". Error regions should be an odd amount of records [" + viz.data.results[k].regions + "]");
                                }
                            }
                    }
                    // Treat NaN and blank values as though they dont exist
                    if (viz.data.results[k].hasOwnProperty(viz.column_names[m]) && $.trim(viz.data.results[k][viz.column_names[m]]) !== "" && ! isNaN(viz.data.results[k][viz.column_names[m]])) {
                        record.y = (+ viz.data.results[k][viz.column_names[m]]);
                        // The summary text is only for the primary line
                        if (m === 1) {
                            summary_count++;
                            summary_total += record.y;
                        }
                    } else {
                        if (viz.config.nulls === "zero") {
                            record.y = 0;
                        } else if (viz.config.nulls === "gap") {
                            record.y = null;
                        } else if (viz.config.nulls === "connect") {
                            // skip row
                            continue;
                        }
                    }
                    // Calculate the data limits (after we have inserted zeros if thats configured)
                    if (record.y !== null) {
                        if (datamin_y === null || datamin_y > record.y) {
                            datamin_y = record.y;
                        }
                        if (datamax_y === null || datamax_y < record.y) {
                            datamax_y = record.y;
                        }
                    }
                    // Figure out which points have a null on both sides. these will need to be drawn as dots
                    if (viz.config.nulls === "gap") {
                        if (record.y === null) {
                            just_gapped = true;
                            just_added = false;
                        } else {
                            if (just_added) {
                                line.orphan_dots.pop(record);
                            }
                            if (just_gapped) {
                                line.orphan_dots.push(record);
                                just_added = true;
                            } else {
                                just_added = false;
                            }
                            just_gapped = false;
                        }
                    }
                    // do the data for the status dots
                    statusdotsev = null;
                    // default to the series color
                    statusdotcolor = line.color;
                    if (record.y !== null) {
                        for(n = 0; n < viz.regions[k].colors.length; n++) {
                            statusdotsev = viz.regions[k].sevs[n];
                            statusdotcolor = viz.regions[k].colors[n];
                            if (viz.config.region_comparison === "") {
                                if (n >= viz.regions[k].stops.length || record.y < (+ viz.regions[k].stops[n])) {
                                    break;
                                }
                            } else {
                                if (n > viz.regions[k].stops.length || record.y < (+ viz.regions[k].stops[n])) {
                                    break;
                                }
                            }

                        }
                        // status dots are still included if they are null (becuase column might not have regions). 
                        // dots are not included if there is a gap in data
                        record.sev = statusdotsev;
                        record.color = statusdotcolor;
                        if (m === 1 || viz.config.multi_series !== "shaded") {
                            line.status_dots.push(record);
                        }
                        // Store a reference to this element. This is for the tooltip
                        viz.xAxisPositions[k].data.push(record);
                        if (m === 1) {
                            viz.line_data_last = record;
                        }
                    }
                    line.line_data.push(record);
                }
            }

            // setup the d3 scales - bottom scale
            viz.xScale = viz.isTimechart ? d3.scaleTime() : d3.scaleLinear();
            //Instead of using d3.extent just use our own calculated values since we already went through the array
            viz.xScale.rangeRound([0, viz.width]).domain([viz.xAxisPositions[0].x, viz.xAxisPositions[viz.xAxisPositions.length - 1].x]).nice();
            viz.xAxis = d3.axisBottom(viz.xScale);
            viz.xAxis.ticks(viz.width / 80);
            // left scale
            if (datamin_y !== null && datamin_y === datamax_y) { 
                if (datamin_y !== 0) { 
                    datamin_y--; 
                }
                datamax_y++;
            }
            if (regionmin_y !== null && regionmin_y === regionmax_y) { 
                if (regionmin_y !== 0) { 
                    regionmin_y--;
                }
                regionmax_y++;
            }
            viz.yScale = d3.scaleLinear()
                .range([viz.height, 0])
                .domain([
                    viz.config.min !== "" ? (+ viz.config.min) : (viz.config.scaleregion === "yes" && regionmin_y !== null && regionmin_y < datamin_y) ? regionmin_y : datamin_y, 
                    viz.config.max !== "" ? (+ viz.config.max) : (viz.config.scaleregion === "yes" && regionmax_y !== null && regionmax_y > datamax_y) ? regionmax_y : datamax_y
                ])
                .nice();
            viz.yAxis = d3.axisLeft(viz.yScale);
            // use about 1 tick per 80pixels of space
            viz.yAxis.ticks(viz.height / 80);

            // reverse the array of lines so primary line is zindexed on top of other lines
            viz.lines.reverse();
            // Precompute the x positions for the lines
            for (m = 0; m < viz.lines.length; m++) {
                for (k = 0; k < viz.lines[m].line_data.length; k++) {
                    viz.lines[m].line_data[k].y_scaled = viz.yScale(viz.lines[m].line_data[k].y);
                }
            }
            // precompute the positions for the bottom axis
            for (m = 0; m < viz.xAxisPositions.length; m++) {
                viz.xAxisPositions[m].x_scaled = viz.xScale(viz.xAxisPositions[m].x);
            }
            // compute the threshold regions
            // use domain limits after nice-ing
            limit_bottom = viz.yScale.domain()[0];
            limit_top = viz.yScale.domain()[1];
            col_width = 10;
            // determine the width of the first two blocks
            if (viz.xAxisPositions.length > 1) {
                col_width = viz.xAxisPositions[1].x_scaled - viz.xAxisPositions[0].x_scaled;
            }
            skips = 1;
            for (i = 0; i < viz.data.results.length; i += skips) {
                // if the regions are exactly the same for multiple rows then they will be collapsed (quick string comparison)
                for (skips = 1; (i + skips) < viz.data.results.length; skips++) {
                    if (viz.data.results[i].regions !== viz.data.results[(i + skips)].regions) {
                        break;
                    }
                }
                // There should always be one more severity than there is stops
                for (j = 0; j < viz.regions[i].colors.length; j++) {
                    d = {
                        "sev": viz.regions[i].colors[j],
                        "left": viz.xAxisPositions[i].x_scaled,
                        "from": Math.min(Math.max(viz.yScale(j === 0 ? limit_bottom :  + viz.regions[i].stops[j-1]), 0), viz.height),
                        "to": Math.min(Math.max(viz.yScale(j >= viz.regions[i].stops.length ? limit_top : + viz.regions[i].stops[j]), 0), viz.height),
                    };
                    // its not a correct assumption that all blocks are the same size. need to calculate proper width here and not just the amount of columns
                    if ((skips + i) >= viz.xAxisPositions.length) {
                        right = viz.xAxisPositions[(viz.data.results.length - 1)].x_scaled + col_width;
                    } else {
                        right = viz.xAxisPositions[(i+skips)].x_scaled;
                    }
                    d.width = Math.max(Math.min(right, viz.width + 10) - d.left, 1);
                    d.height = d.from - d.to;
                    if (d.height > 0 && viz.regions[i].colors[j] !== "") {
                        viz.all_regions.push(d);
                    }
                }
            }
            // there might be a large gap between the last point to the end of the chart, so limit it to the regualr size of a gap
            //viz.data.results[viz.data.results.length - 1].width = Math.min(viz.data.results[viz.data.results.length - 1].width, col_width);



            // #################################################################################################################
            //   ______     ______   ____       _               
            //  / ___\ \   / / ___| / ___|  ___| |_ _   _ _ __  
            //  \___ \\ \ / / |  _  \___ \ / _ \ __| | | | '_ \ 
            //   ___) |\ V /| |_| |  ___) |  __/ |_| |_| | |_) |
            //  |____/  \_/  \____| |____/ \___|\__|\__,_| .__/ 
            //                                           |_|    

            if (viz.isFirstDraw) {
                // create and append the svg object to the body of the page
                var svgmain = d3.create("svg")
                    .attr("width", viz.width + viz.margin.left + viz.margin.right)
                    .attr("height", viz.height + viz.margin.top + viz.margin.bottom);

                viz.shadow_id = viz.instance_id + "_" + (viz.instance_id_ctr++);
                var defs = svgmain.append("defs");
                // height=120% so that the shadow is not clipped
                var filter = defs.append("filter").attr("id", viz.shadow_id).attr("height", "120%").attr("filterUnits","userSpaceOnUse");
                // From: http://bl.ocks.org/cpbotha/raw/5200394/dropshadow.js with tweaks.
                filter.append("feGaussianBlur").attr("in", "SourceAlpha").attr("stdDeviation", 2).attr("result", viz.shadow_id + "A");
                filter.append("feColorMatrix").attr("in", viz.shadow_id + "A").attr("type","matrix").attr("values", "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 " + (viz.config.shadow / 100) + " 0").attr("result", viz.shadow_id + "B");
                var feMerge = filter.append("feMerge");
                feMerge.append("feMergeNode").attr("in", viz.shadow_id + "B");
                feMerge.append("feMergeNode").attr("in", "SourceGraphic");

                viz.svg = svgmain.append("g").attr("transform", "translate(" + viz.margin.left + "," + viz.margin.top + ")");

                viz.$container_wrap.append(svgmain.node());

                // Create some svg groups to contain things
                viz.xAxisGroup = viz.svg.append("g").attr("class","region_chart_viz-xaxis").attr("transform", "translate(0," + viz.height + ")");
                viz.yAxisGroup = viz.svg.append("g").attr("class","region_chart_viz-yaxis");
                viz.region_g = viz.svg.append("g").attr("class","region_chart_viz-regions");
                viz.lines_g = viz.svg.append("g").attr("class","region_chart_viz-lines");
                viz.orphan_dots_g = viz.svg.append("g").attr("class","region_chart_viz-orphan_dots");
                viz.status_dots_g = viz.svg.append("g").attr("class","region_chart_viz-status_dots");

                viz.summary_text = viz.svg.append("text")
                    .attr("class", "region_chart_viz-summary_text " + (viz.theme === 'light' ? "region_chart_viz-overlaytext_light" : "region_chart_viz-overlaytext_dark" ))
                    .attr("font-size", viz.overlay_text_size + "px")
                    .attr("y", 10 + viz.overlay_text_size)
                    .attr("x", 20)
                    .style("pointer-events", "none")
                    .style("visibility", "hidden");

                viz.last_text = viz.svg.append("text")
                    .attr("class", "region_chart_viz-last_text " + (viz.theme === 'light' ? "region_chart_viz-overlaytext_light" : "region_chart_viz-overlaytext_dark" ))
                    .attr("text-anchor", "end")
                    .attr("font-size", viz.overlay_text_size + "px")
                    .attr("width", 300)
                    .style("pointer-events", "none")
                    .style("visibility", "hidden");

                viz.last_dot = viz.svg.append("circle")
                    .attr("class","region_chart_viz-last_dot")
                    .attr("fill", viz.config.line_color)
                    .attr("stroke-width", 3)
                    .attr("stroke", viz.config.line_color)
                    .attr("r", Math.max(3,Number(viz.config.line_size)))
                    .style("visibility", "hidden")
                    .style("pointer-events", "none");

                viz.last_dot_pulse = viz.svg.append("circle")
                    .attr("class","region_chart_viz-pulse1")
                    .attr("fill", "none")
                    .attr("stroke", viz.config.line_color)
                    .attr("r", Number(viz.config.line_size))
                    .style("visibility", "hidden")
                    .style("pointer-events", "none");

                // The axis titles
                if (viz.config.xtitle_show !== "hide") {
                    viz.svg.append("text")
                        .attr("text-anchor", "middle")
                        .attr("y", viz.height + 40)
                        .attr("x", viz.width / 2)
                        .text(viz.config.xtitle_text === "" ? viz.column_names[0] : viz.config.xtitle_text);
                }
                if (viz.config.ytitle_show !== "hide") {
                    viz.svg.append("text")
                        .attr("text-anchor", "middle")
                        .attr("y", -60)
                        .attr("x", viz.height * -0.5)
                        .attr("width", viz.height)
                        .attr("height", 20)
                        .attr("transform", "rotate(270 " + 0 + " " + 0 + ")")
                        .text(viz.config.ytitle_text === "" && viz.column_names.length === 2 ? viz.column_names[1] : viz.config.ytitle_text);
                }
                // Create a line function
                viz.linepathbuilder = d3.line()
                    .defined(function(d) { return d.y !== null; })
                    .x(function(d) { return viz.xAxisPositions[d.row].x_scaled; })
                    .y(function(d) { return d.y_scaled; });
                
                // add line curve or stepping if configured
                if (viz.config.type === "curve") {
                    viz.linepathbuilder.curve(d3.curveMonotoneX);
                } else if (viz.config.type === "step") {
                    viz.linepathbuilder.curve(d3.curveStep);
                }
            }

            // Add the axis scales and animate them when they update
            viz.xAxisGroup
                .transition()
                .duration(viz.isFirstDraw ? 0 : viz.config.transition_time)
                .call(viz.xAxis);

            viz.yAxisGroup
                .transition()
                .duration(viz.isFirstDraw ? 0 : viz.config.transition_time)
                .call(viz.yAxis)
                //  extend the tick line
                .call(function(g) { 
                    return g.selectAll(".tick:not(:first-of-type) line")
                        .attr("x1", viz.width)
                        .attr("stroke", (viz.theme === 'light' ? "#e1e6eb" : "#324147" ));
                });

            // add the threshold regions underneath
            viz.region_g.selectAll("rect")
                .data(viz.all_regions)
                .join(function(enter){
                    return enter.append("rect");
                }, function(update){
                    return update;
                }, function(exit){
                    return exit.remove();
                }).transition()
                    .duration(viz.isFirstDraw ? 0 : viz.config.transition_time)
                    .attr("fill", function(d) { return viz.getSeverityColor(d.sev); })
                    .attr("opacity", viz.config.region_opacity / 100)
                    .attr("x", function(d) { return d.left; })
                    .attr("y", function(d) { return d.to; })
                    .attr("width", function(d) { return d.width; })
                    .attr("height", function(d) { return d.height; });


            // Draw the lines
            viz.lines_g.selectAll("path")
                .data(viz.lines)
                .join(function(enter){
                    return enter.append("path").attr("class","region_chart_viz-line").attr("filter", "url(#" + viz.shadow_id + ")");
                }, function(update){
                    return update;
                }, function(exit){
                    return exit.remove();
                })
                .attr("stroke", function(d) { return d.color; })
                .attr("stroke-dasharray", function(d) { return d.dash; })
                .attr("fill", "none")
                .attr("stroke-width", viz.config.line_size)
                .datum(function(d){ return d.line_data; })
                    .transition()
                    .duration(viz.config.transition_time)
                    .attr("d", viz.linepathbuilder);


            // Appends a circle for each orphaned datapoint (a line that has gaps on both sides)
            viz.orphan_dots_g.selectAll("g")
                .data(viz.lines)
                .join("g")
                .selectAll("circle")
                .data(function(d){ return d.orphan_dots; })
                .join(function(enter){
                    return enter
                        .append("circle")
                        // need to use the series colour
                        .attr("fill", function(d) { return viz.lines[viz.lines.length - d.idx - 1].color; })
                        .attr("filter", "url(#" + viz.shadow_id + ")")
                        // These next two lines are here because sometimes new dots are created after inital draw and we dont want them flying across the screen.
                        .attr("cx", function(d) { return viz.xAxisPositions[d.row].x_scaled; })
                        .attr("cy", function(d) { return d.y_scaled; })
                        .attr("r", viz.config.line_size);
                }, function(update){
                    return update;
                }, function(exit){
                    return exit.remove();
                }).transition()
                    .duration(viz.config.transition_time)
                    .attr("cx", function(d) { return viz.xAxisPositions[d.row].x_scaled; })
                    .attr("cy", function(d) { return d.y_scaled; }); 


            // Appends a status circle for each datapoint 
            if (viz.config.status_dots !== "hide") {
                viz.status_dots_g.selectAll("g")
                    .data(viz.lines)
                    .join("g")
                    .attr("stroke", function(d) { return d.color; })
                    .selectAll("circle")
                    .data(function(d){ return d.status_dots; })
                    .join(function(enter) {
                        return enter
                            .append("circle")
                            // These next two lines are here because sometimes new dots are created after inital draw and we dont want them flying across the screen.
                            .attr("cx", function(d) { return viz.xAxisPositions[d.row].x_scaled; })
                            .attr("cy", function(d) { return d.y_scaled; })
                            .attr("r", viz.config.line_size);
                    }, function(update) {
                        return update;
                    }, function(exit) {
                        return exit.remove();
                    }).transition()
                        .duration(viz.config.transition_time)
                        .attr("fill", function(d){ return d.color === null ? viz.config.line_color : viz.getSeverityColor(d.color); })
                        .attr("cx", function(d) { return viz.xAxisPositions[d.row].x_scaled; })
                        .attr("cy", function(d) { return d.y_scaled; });
            }

            // add the summary overlay text if required
            if (viz.config.summ_text !== "hide" && summary_count > 0) {
                viz.summary_text
                    .style("visibility", "")
                    .text((viz.config.summ_text === "avg") ? "Average: " + viz.formatWithPrecision(summary_total / summary_count) : "Total: " + viz.formatWithPrecision(summary_total));
            }

            // add the last element text if required
            if (viz.config.last_text !== "hide" && viz.line_data_last != null) {
                var last_text_top = viz.line_data_last.y_scaled;
                viz.last_text
                    .transition()
                    .duration(viz.isFirstDraw ? 0 : viz.config.transition_time)
                    .style("visibility", "")
                    .attr("y", (last_text_top > viz.height / 2) ? last_text_top - viz.overlay_text_size : last_text_top + viz.overlay_text_size * 2 )
                    .attr("x", viz.xAxisPositions[viz.line_data_last.row].x_scaled)
                    .text(viz.formatWithPrecision(viz.line_data_last.y));

                // if there isnt already status dots, then add a dot for the final element
                if (viz.config.status_dots === "hide") {
                    viz.last_dot
                        .transition()
                        .duration(viz.isFirstDraw ? 0 : viz.config.transition_time)
                        .style("visibility", "")
                        .attr("cx", viz.xAxisPositions[viz.line_data_last.row].x_scaled)
                        .attr("cy", viz.line_data_last.y_scaled);
                }

                // add a dot that is pulsing
                viz.last_dot_pulse
                    .transition()
                    .duration(viz.isFirstDraw ? 0 : viz.config.transition_time)
                    .style("visibility", "")
                    .attr("cx", viz.xAxisPositions[viz.line_data_last.row].x_scaled)
                    .attr("cy", viz.line_data_last.y_scaled);
            }


            // #################################################################################################################
            //   _____           _ _   _       
            //  |_   _|__   ___ | | |_(_)_ __  
            //    | |/ _ \ / _ \| | __| | '_ \ 
            //    | | (_) | (_) | | |_| | |_) |
            //    |_|\___/ \___/|_|\__|_| .__/ 
            //                          |_|    

            if (viz.isFirstDraw) {
                var tooltip = $("<div class=\"region_chart_viz-tooltip\"><table><tbody><tr><td colspan=\"3\" class=\"region_chart_viz-tooltip_date\"></td></tr></tbody></table></div>").appendTo(viz.$container_wrap);
                var tooltip_date = tooltip.find(".region_chart_viz-tooltip_date");
                var tooltip_body = tooltip.find("tbody");

                // Create a rect on top of the svg area: this rectangle recovers mouse position
                var overlay_rect = viz.svg.append("rect")
                    .attr("class","region_chart_viz-tt_overlay")
                    .attr("width", viz.width)
                    .attr("height", viz.height)
                    .style("fill", "none")
                    .style("pointer-events", "all");

                // Create the line that shows what points are hovered
                var focus = viz.svg
                    .append("rect")
                    .attr("class","region_chart_viz-tt_focus_ring")
                    .attr("stroke", "black")
                    .attr("stroke-opacity", 0.3)
                    .attr("stroke-width", 1)
                    .attr("width", 1)
                    .attr("height", viz.height)
                    .style("pointer-events", "none")
                    .style("fill", "none")
                    .style("opacity", 0);

                overlay_rect.on("mouseover", function() {
                    focus.style("opacity", 1);
                    tooltip.css("opacity", 1);
                })
                .on("mousemove", function() {
                    var j, tt_str = [], tt_height;
                    var mouse_x = d3.mouse(this)[0];
                    var hoveredIdx = 0;
                    var curr = viz.xAxisPositions[hoveredIdx].x_scaled;
                    var diff = Math.abs (mouse_x - curr);
                    // Find the nearest point to the mouse cursor on the horizontal axis
                    for (var val = 0; val < viz.xAxisPositions.length; val++) {
                        var newdiff = Math.abs (mouse_x - viz.xAxisPositions[val].x_scaled);
                        if (newdiff < diff) {
                            diff = newdiff;
                            curr = viz.xAxisPositions[val].x_scaled;
                            hoveredIdx = val;
                        }
                    }

                    tooltip_body.find(".region_chart_viz-tooltip_rows").remove();
                    if (viz.xAxisPositions[hoveredIdx] && viz.xAxisPositions[hoveredIdx].data.length > 0) {
                        var selectedData = viz.xAxisPositions[hoveredIdx].data;
                        // move the horizontal indicator
                        focus.attr("x", viz.xAxisPositions[selectedData[0].row].x_scaled);
                        tooltip_date.text(viz.xAxisPositions[selectedData[0].row].x_fmt);
                        tt_str = [];
                        // basic protection against html injection
                        for (j = 0; j < selectedData.length; j++) {
                            tt_str.push("<tr class=\"region_chart_viz-tooltip_rows\">" + 
                                "<td class=\"region_chart_viz-tooltip_name\">" + (viz.lines.length > 1 ? "<span class='region_chart_viz-tooltip_colorbox' style='background-color:" + viz.lines[viz.lines.length - selectedData[j].idx - 1].color + "'></span> " : "") + 
                                viz.htmlEncode(viz.lines[viz.lines.length - selectedData[j].idx - 1].name) + "</td>"+
                                "<td class=\"region_chart_viz-tooltip_sev\">" + 
                                    ((selectedData[j].sev !== null) ? "<span class='region_chart_viz-tooltip_colorbox' style='background-color:" + viz.getSeverityColor(selectedData[j].color) + "'></span> " + selectedData[j].sev : "") + 
                                "</td>"+
                                "<td class=\"region_chart_viz-tooltip_value\">" + viz.formatWithPrecision(selectedData[j].y) + "</td>"+
                                "</tr>");
                        }
                        tt_str.push("<tr class=\"region_chart_viz-tooltip_hr region_chart_viz-tooltip_rows\"><td colspan=\"3\"> </td></tr>");
                        // add details of the regions here
                        for (j = viz.regions[selectedData[0].row].sevs.length - 1; j >= 0; j--) {
                            tt_str.push("<tr class='region_chart_viz-tooltip_rows'>"+
                                    "<td></td>"+
                                    "<td class='region_chart_viz-tooltip_tcell'><span class='region_chart_viz-tooltip_colorbox' style='background-color:" + viz.getSeverityColor(viz.regions[selectedData[0].row].colors[j]) + "'></span> " + viz.regions[selectedData[0].row].sevs[j] + "</td>"+
                                    "<td class='region_chart_viz-tooltip_th'>" + (j > 0 ? viz.formatWithPrecision(viz.regions[selectedData[0].row].stops[j - 1]) : "") + "</td>"+
                                "</tr>");
                        }
                        $(tt_str.join("")).appendTo(tooltip_body);
                        // should probaly use the actual computed height but this is faster and good enough
                        tt_height = (40 + (tt_str.length * 22));
                        //position the box about the middle, but limit when near top or bottom
                        tooltip.css("top", Math.max(viz.margin.top + 2, Math.min((viz.height - tt_height), selectedData[0].y_scaled - (tt_height / 2))));
                        // show on the left or right of point depending on whcih side of the chart we are on
                        if (viz.xAxisPositions[selectedData[0].row].x_scaled < viz.width / 2){ 
                            tooltip.css({"left": viz.xAxisPositions[selectedData[0].row].x_scaled + 100, "right": ""});
                        } else {
                            tooltip.css({"left": "", "right": viz.width - viz.xAxisPositions[selectedData[0].row].x_scaled + 80});
                        }
                    }
                })
                .on("mouseout", function () {
                    focus.style("opacity", 0);
                    tooltip.css("opacity", 0);
                });
            }

        },

        // Override to respond to re-sizing events
        reflow: function() {
            this.scheduleDraw();
        },

        // Search data params
        getInitialDataParams: function() {
            return ({
                outputMode: SplunkVisualizationBase.RAW_OUTPUT_MODE,
                count: 10000
            });
        },
    };

    return SplunkVisualizationBase.extend(vizObj);
});