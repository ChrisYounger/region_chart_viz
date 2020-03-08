// TODO would be good to stop the lines (etc) from extending outside the canvas and over the axis
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils',
    'jquery',
    'd3'
],
function(
    SplunkVisualizationBase,
    vizUtils,
    $,
    d3
) {
    var vizObj = {
        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            var viz = this;
            viz.instance_id = "region_chart_viz_" + Math.round(Math.random() * 1000000);
            viz.instance_id_ctr = 0;
            viz.theme = 'light'; 
            if (typeof vizUtils.getCurerntTheme === "function") {
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
                shadow: "20",
                line_color: "#000000",
                min: "",
                max: "",
                text_precision: "-1",
                text_thousands: "no",
                text_unit: "",
                text_unit_position: "after",
                region_opacity: "35",
                color_critical: "#B50101",
                color_high: "#F26A35",
                color_medium: "#FCB64E",
                color_low: "#FFE98C",
                color_normal: "#99D18B",
                color_info: "#AED3E5",
                transition_time: "1000",
                row_limit: "5000"
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
            if (viz.$container_wrap.height() <= 0) {
                return;
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
                    line.color = tinycolor(viz.config.line_color).lighten(15 * m).toString();
                    line.dash = (viz.config.line_size * 3) + ", " + viz.config.line_size;
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
                            x_record.x = new Date(viz.data.results[k][viz.column_names[0]]);
                            x_record.x_fmt = (new Date(viz.data.results[k][viz.column_names[0]])).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short',  year: 'numeric', hour:"2-digit", minute:"2-digit", second:"2-digit" });
                        } else {
                            x_record.x = +viz.data.results[k][viz.column_names[0]];
                            x_record.x_fmt = viz.data.results[k][viz.column_names[0]];
                        }
                        viz.regions[k] = {stops: [], sevs: [], colors: []};
                            if (viz.data.results[k].hasOwnProperty("regions") && $.trim(viz.data.results[k].regions) !== "") {
                                regions_arr =  viz.htmlEncode(viz.data.results[k].regions.toLowerCase()).split(",");
                                if ((regions_arr.length % 2) === 1) {
                                    // only save these if they are valid (1 more severity than stops)
                                    for (l = 0; l < regions_arr.length; l++){
                                        // if its an odd element
                                        if (l % 2 === 1) {
                                            viz.regions[k].stops.push(regions_arr[l]);
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
                            if (n >= viz.regions[k].stops.length || record.y < (+ viz.regions[k].stops[n])) {
                                break;
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
            // left scale
            viz.yScale = d3.scaleLinear().range([viz.height, 0]).domain([viz.config.min !== "" ? (+ viz.config.min) : datamin_y, viz.config.max !== "" ? (+ viz.config.max) : datamax_y]).nice();
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



// ##########################################################################################################################################################
//            _____ _              ____      _            
//           |_   _(_)_ __  _   _ / ___|___ | | ___  _ __ 
//             | | | | '_ \| | | | |   / _ \| |/ _ \| '__|
//             | | | | | | | |_| | |__| (_) | | (_) | |   
//             |_| |_|_| |_|\__, |\____\___/|_|\___/|_|   
//                          |___/                         
// ##########################################################################################################################################################
    // TinyColor v1.4.1
    // https://github.com/bgrins/TinyColor
    // Brian Grinstead, MIT License

    var tinycolor = (function(Math) {

    var trimLeft = /^\s+/,
        trimRight = /\s+$/,
        tinyCounter = 0,
        mathRound = Math.round,
        mathMin = Math.min,
        mathMax = Math.max,
        mathRandom = Math.random;

    function tinycolor (color, opts) {

        color = (color) ? color : '';
        opts = opts || { };

        // If input is already a tinycolor, return itself
        if (color instanceof tinycolor) {
        return color;
        }
        // If we are called as a function, call using new instead
        if (!(this instanceof tinycolor)) {
            return new tinycolor(color, opts);
        }

        var rgb = inputToRGB(color);
        this._originalInput = color,
        this._r = rgb.r,
        this._g = rgb.g,
        this._b = rgb.b,
        this._a = rgb.a,
        this._roundA = mathRound(100*this._a) / 100,
        this._format = opts.format || rgb.format;
        this._gradientType = opts.gradientType;

        // Don't let the range of [0,255] come back in [0,1].
        // Potentially lose a little bit of precision here, but will fix issues where
        // .5 gets interpreted as half of the total, instead of half of 1
        // If it was supposed to be 128, this was already taken care of by `inputToRgb`
        if (this._r < 1) { this._r = mathRound(this._r); }
        if (this._g < 1) { this._g = mathRound(this._g); }
        if (this._b < 1) { this._b = mathRound(this._b); }

        this._ok = rgb.ok;
        this._tc_id = tinyCounter++;
    }

    tinycolor.prototype = {
        isDark: function() {
            return this.getBrightness() < 128;
        },
        isLight: function() {
            return !this.isDark();
        },
        isValid: function() {
            return this._ok;
        },
        getOriginalInput: function() {
        return this._originalInput;
        },
        getFormat: function() {
            return this._format;
        },
        getAlpha: function() {
            return this._a;
        },
        getBrightness: function() {
            //http://www.w3.org/TR/AERT#color-contrast
            var rgb = this.toRgb();
            return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
        },
        getLuminance: function() {
            //http://www.w3.org/TR/2008/REC-WCAG20-20081211/#relativeluminancedef
            var rgb = this.toRgb();
            var RsRGB, GsRGB, BsRGB, R, G, B;
            RsRGB = rgb.r/255;
            GsRGB = rgb.g/255;
            BsRGB = rgb.b/255;

            if (RsRGB <= 0.03928) {R = RsRGB / 12.92;} else {R = Math.pow(((RsRGB + 0.055) / 1.055), 2.4);}
            if (GsRGB <= 0.03928) {G = GsRGB / 12.92;} else {G = Math.pow(((GsRGB + 0.055) / 1.055), 2.4);}
            if (BsRGB <= 0.03928) {B = BsRGB / 12.92;} else {B = Math.pow(((BsRGB + 0.055) / 1.055), 2.4);}
            return (0.2126 * R) + (0.7152 * G) + (0.0722 * B);
        },
        setAlpha: function(value) {
            this._a = boundAlpha(value);
            this._roundA = mathRound(100*this._a) / 100;
            return this;
        },
        toHsv: function() {
            var hsv = rgbToHsv(this._r, this._g, this._b);
            return { h: hsv.h * 360, s: hsv.s, v: hsv.v, a: this._a };
        },
        toHsvString: function() {
            var hsv = rgbToHsv(this._r, this._g, this._b);
            var h = mathRound(hsv.h * 360), s = mathRound(hsv.s * 100), v = mathRound(hsv.v * 100);
            return (this._a == 1) ?
            "hsv("  + h + ", " + s + "%, " + v + "%)" :
            "hsva(" + h + ", " + s + "%, " + v + "%, "+ this._roundA + ")";
        },
        toHsl: function() {
            var hsl = rgbToHsl(this._r, this._g, this._b);
            return { h: hsl.h * 360, s: hsl.s, l: hsl.l, a: this._a };
        },
        toHslString: function() {
            var hsl = rgbToHsl(this._r, this._g, this._b);
            var h = mathRound(hsl.h * 360), s = mathRound(hsl.s * 100), l = mathRound(hsl.l * 100);
            return (this._a == 1) ?
            "hsl("  + h + ", " + s + "%, " + l + "%)" :
            "hsla(" + h + ", " + s + "%, " + l + "%, "+ this._roundA + ")";
        },
        toHex: function(allow3Char) {
            return rgbToHex(this._r, this._g, this._b, allow3Char);
        },
        toHexString: function(allow3Char) {
            return '#' + this.toHex(allow3Char);
        },
        toHex8: function(allow4Char) {
            return rgbaToHex(this._r, this._g, this._b, this._a, allow4Char);
        },
        toHex8String: function(allow4Char) {
            return '#' + this.toHex8(allow4Char);
        },
        toRgb: function() {
            return { r: mathRound(this._r), g: mathRound(this._g), b: mathRound(this._b), a: this._a };
        },
        toRgbString: function() {
            return (this._a == 1) ?
            "rgb("  + mathRound(this._r) + ", " + mathRound(this._g) + ", " + mathRound(this._b) + ")" :
            "rgba(" + mathRound(this._r) + ", " + mathRound(this._g) + ", " + mathRound(this._b) + ", " + this._roundA + ")";
        },
        toPercentageRgb: function() {
            return { r: mathRound(bound01(this._r, 255) * 100) + "%", g: mathRound(bound01(this._g, 255) * 100) + "%", b: mathRound(bound01(this._b, 255) * 100) + "%", a: this._a };
        },
        toPercentageRgbString: function() {
            return (this._a == 1) ?
            "rgb("  + mathRound(bound01(this._r, 255) * 100) + "%, " + mathRound(bound01(this._g, 255) * 100) + "%, " + mathRound(bound01(this._b, 255) * 100) + "%)" :
            "rgba(" + mathRound(bound01(this._r, 255) * 100) + "%, " + mathRound(bound01(this._g, 255) * 100) + "%, " + mathRound(bound01(this._b, 255) * 100) + "%, " + this._roundA + ")";
        },
        toName: function() {
            if (this._a === 0) {
                return "transparent";
            }

            if (this._a < 1) {
                return false;
            }

            return hexNames[rgbToHex(this._r, this._g, this._b, true)] || false;
        },
        toFilter: function(secondColor) {
            var hex8String = '#' + rgbaToArgbHex(this._r, this._g, this._b, this._a);
            var secondHex8String = hex8String;
            var gradientType = this._gradientType ? "GradientType = 1, " : "";

            if (secondColor) {
                var s = tinycolor(secondColor);
                secondHex8String = '#' + rgbaToArgbHex(s._r, s._g, s._b, s._a);
            }

            return "progid:DXImageTransform.Microsoft.gradient("+gradientType+"startColorstr="+hex8String+",endColorstr="+secondHex8String+")";
        },
        toString: function(format) {
            var formatSet = !!format;
            format = format || this._format;

            var formattedString = false;
            var hasAlpha = this._a < 1 && this._a >= 0;
            var needsAlphaFormat = !formatSet && hasAlpha && (format === "hex" || format === "hex6" || format === "hex3" || format === "hex4" || format === "hex8" || format === "name");

            if (needsAlphaFormat) {
                // Special case for "transparent", all other non-alpha formats
                // will return rgba when there is transparency.
                if (format === "name" && this._a === 0) {
                    return this.toName();
                }
                return this.toRgbString();
            }
            if (format === "rgb") {
                formattedString = this.toRgbString();
            }
            if (format === "prgb") {
                formattedString = this.toPercentageRgbString();
            }
            if (format === "hex" || format === "hex6") {
                formattedString = this.toHexString();
            }
            if (format === "hex3") {
                formattedString = this.toHexString(true);
            }
            if (format === "hex4") {
                formattedString = this.toHex8String(true);
            }
            if (format === "hex8") {
                formattedString = this.toHex8String();
            }
            if (format === "name") {
                formattedString = this.toName();
            }
            if (format === "hsl") {
                formattedString = this.toHslString();
            }
            if (format === "hsv") {
                formattedString = this.toHsvString();
            }

            return formattedString || this.toHexString();
        },
        clone: function() {
            return tinycolor(this.toString());
        },

        _applyModification: function(fn, args) {
            var color = fn.apply(null, [this].concat([].slice.call(args)));
            this._r = color._r;
            this._g = color._g;
            this._b = color._b;
            this.setAlpha(color._a);
            return this;
        },
        lighten: function() {
            return this._applyModification(lighten, arguments);
        },
        brighten: function() {
            return this._applyModification(brighten, arguments);
        },
        darken: function() {
            return this._applyModification(darken, arguments);
        },
        desaturate: function() {
            return this._applyModification(desaturate, arguments);
        },
        saturate: function() {
            return this._applyModification(saturate, arguments);
        },
        greyscale: function() {
            return this._applyModification(greyscale, arguments);
        },
        spin: function() {
            return this._applyModification(spin, arguments);
        },

        _applyCombination: function(fn, args) {
            return fn.apply(null, [this].concat([].slice.call(args)));
        },
        analogous: function() {
            return this._applyCombination(analogous, arguments);
        },
        complement: function() {
            return this._applyCombination(complement, arguments);
        },
        monochromatic: function() {
            return this._applyCombination(monochromatic, arguments);
        },
        splitcomplement: function() {
            return this._applyCombination(splitcomplement, arguments);
        },
        triad: function() {
            return this._applyCombination(triad, arguments);
        },
        tetrad: function() {
            return this._applyCombination(tetrad, arguments);
        }
    };

    // If input is an object, force 1 into "1.0" to handle ratios properly
    // String input requires "1.0" as input, so 1 will be treated as 1
    tinycolor.fromRatio = function(color, opts) {
        if (typeof color == "object") {
            var newColor = {};
            for (var i in color) {
                if (color.hasOwnProperty(i)) {
                    if (i === "a") {
                        newColor[i] = color[i];
                    }
                    else {
                        newColor[i] = convertToPercentage(color[i]);
                    }
                }
            }
            color = newColor;
        }

        return tinycolor(color, opts);
    };

    // Given a string or object, convert that input to RGB
    // Possible string inputs:
    //
    //     "red"
    //     "#f00" or "f00"
    //     "#ff0000" or "ff0000"
    //     "#ff000000" or "ff000000"
    //     "rgb 255 0 0" or "rgb (255, 0, 0)"
    //     "rgb 1.0 0 0" or "rgb (1, 0, 0)"
    //     "rgba (255, 0, 0, 1)" or "rgba 255, 0, 0, 1"
    //     "rgba (1.0, 0, 0, 1)" or "rgba 1.0, 0, 0, 1"
    //     "hsl(0, 100%, 50%)" or "hsl 0 100% 50%"
    //     "hsla(0, 100%, 50%, 1)" or "hsla 0 100% 50%, 1"
    //     "hsv(0, 100%, 100%)" or "hsv 0 100% 100%"
    //
    function inputToRGB(color) {

        var rgb = { r: 0, g: 0, b: 0 };
        var a = 1;
        var s = null;
        var v = null;
        var l = null;
        var ok = false;
        var format = false;

        if (typeof color == "string") {
            color = stringInputToObject(color);
        }

        if (typeof color == "object") {
            if (isValidCSSUnit(color.r) && isValidCSSUnit(color.g) && isValidCSSUnit(color.b)) {
                rgb = rgbToRgb(color.r, color.g, color.b);
                ok = true;
                format = String(color.r).substr(-1) === "%" ? "prgb" : "rgb";
            }
            else if (isValidCSSUnit(color.h) && isValidCSSUnit(color.s) && isValidCSSUnit(color.v)) {
                s = convertToPercentage(color.s);
                v = convertToPercentage(color.v);
                rgb = hsvToRgb(color.h, s, v);
                ok = true;
                format = "hsv";
            }
            else if (isValidCSSUnit(color.h) && isValidCSSUnit(color.s) && isValidCSSUnit(color.l)) {
                s = convertToPercentage(color.s);
                l = convertToPercentage(color.l);
                rgb = hslToRgb(color.h, s, l);
                ok = true;
                format = "hsl";
            }

            if (color.hasOwnProperty("a")) {
                a = color.a;
            }
        }

        a = boundAlpha(a);

        return {
            ok: ok,
            format: color.format || format,
            r: mathMin(255, mathMax(rgb.r, 0)),
            g: mathMin(255, mathMax(rgb.g, 0)),
            b: mathMin(255, mathMax(rgb.b, 0)),
            a: a
        };
    }


    // Conversion Functions
    // --------------------

    // `rgbToHsl`, `rgbToHsv`, `hslToRgb`, `hsvToRgb` modified from:
    // <http://mjijackson.com/2008/02/rgb-to-hsl-and-rgb-to-hsv-color-model-conversion-algorithms-in-javascript>

    // `rgbToRgb`
    // Handle bounds / percentage checking to conform to CSS color spec
    // <http://www.w3.org/TR/css3-color/>
    // *Assumes:* r, g, b in [0, 255] or [0, 1]
    // *Returns:* { r, g, b } in [0, 255]
    function rgbToRgb(r, g, b){
        return {
            r: bound01(r, 255) * 255,
            g: bound01(g, 255) * 255,
            b: bound01(b, 255) * 255
        };
    }

    // `rgbToHsl`
    // Converts an RGB color value to HSL.
    // *Assumes:* r, g, and b are contained in [0, 255] or [0, 1]
    // *Returns:* { h, s, l } in [0,1]
    function rgbToHsl(r, g, b) {

        r = bound01(r, 255);
        g = bound01(g, 255);
        b = bound01(b, 255);

        var max = mathMax(r, g, b), min = mathMin(r, g, b);
        var h, s, l = (max + min) / 2;

        if(max == min) {
            h = s = 0; // achromatic
        }
        else {
            var d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch(max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }

            h /= 6;
        }

        return { h: h, s: s, l: l };
    }

    // `hslToRgb`
    // Converts an HSL color value to RGB.
    // *Assumes:* h is contained in [0, 1] or [0, 360] and s and l are contained [0, 1] or [0, 100]
    // *Returns:* { r, g, b } in the set [0, 255]
    function hslToRgb(h, s, l) {
        var r, g, b;

        h = bound01(h, 360);
        s = bound01(s, 100);
        l = bound01(l, 100);

        function hue2rgb(p, q, t) {
            if(t < 0) t += 1;
            if(t > 1) t -= 1;
            if(t < 1/6) return p + (q - p) * 6 * t;
            if(t < 1/2) return q;
            if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        }

        if(s === 0) {
            r = g = b = l; // achromatic
        }
        else {
            var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            var p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }

        return { r: r * 255, g: g * 255, b: b * 255 };
    }

    // `rgbToHsv`
    // Converts an RGB color value to HSV
    // *Assumes:* r, g, and b are contained in the set [0, 255] or [0, 1]
    // *Returns:* { h, s, v } in [0,1]
    function rgbToHsv(r, g, b) {

        r = bound01(r, 255);
        g = bound01(g, 255);
        b = bound01(b, 255);

        var max = mathMax(r, g, b), min = mathMin(r, g, b);
        var h, s, v = max;

        var d = max - min;
        s = max === 0 ? 0 : d / max;

        if(max == min) {
            h = 0; // achromatic
        }
        else {
            switch(max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h: h, s: s, v: v };
    }

    // `hsvToRgb`
    // Converts an HSV color value to RGB.
    // *Assumes:* h is contained in [0, 1] or [0, 360] and s and v are contained in [0, 1] or [0, 100]
    // *Returns:* { r, g, b } in the set [0, 255]
    function hsvToRgb(h, s, v) {

        h = bound01(h, 360) * 6;
        s = bound01(s, 100);
        v = bound01(v, 100);

        var i = Math.floor(h),
            f = h - i,
            p = v * (1 - s),
            q = v * (1 - f * s),
            t = v * (1 - (1 - f) * s),
            mod = i % 6,
            r = [v, q, p, p, t, v][mod],
            g = [t, v, v, q, p, p][mod],
            b = [p, p, t, v, v, q][mod];

        return { r: r * 255, g: g * 255, b: b * 255 };
    }

    // `rgbToHex`
    // Converts an RGB color to hex
    // Assumes r, g, and b are contained in the set [0, 255]
    // Returns a 3 or 6 character hex
    function rgbToHex(r, g, b, allow3Char) {

        var hex = [
            pad2(mathRound(r).toString(16)),
            pad2(mathRound(g).toString(16)),
            pad2(mathRound(b).toString(16))
        ];

        // Return a 3 character hex if possible
        if (allow3Char && hex[0].charAt(0) == hex[0].charAt(1) && hex[1].charAt(0) == hex[1].charAt(1) && hex[2].charAt(0) == hex[2].charAt(1)) {
            return hex[0].charAt(0) + hex[1].charAt(0) + hex[2].charAt(0);
        }

        return hex.join("");
    }

    // `rgbaToHex`
    // Converts an RGBA color plus alpha transparency to hex
    // Assumes r, g, b are contained in the set [0, 255] and
    // a in [0, 1]. Returns a 4 or 8 character rgba hex
    function rgbaToHex(r, g, b, a, allow4Char) {

        var hex = [
            pad2(mathRound(r).toString(16)),
            pad2(mathRound(g).toString(16)),
            pad2(mathRound(b).toString(16)),
            pad2(convertDecimalToHex(a))
        ];

        // Return a 4 character hex if possible
        if (allow4Char && hex[0].charAt(0) == hex[0].charAt(1) && hex[1].charAt(0) == hex[1].charAt(1) && hex[2].charAt(0) == hex[2].charAt(1) && hex[3].charAt(0) == hex[3].charAt(1)) {
            return hex[0].charAt(0) + hex[1].charAt(0) + hex[2].charAt(0) + hex[3].charAt(0);
        }

        return hex.join("");
    }

    // `rgbaToArgbHex`
    // Converts an RGBA color to an ARGB Hex8 string
    // Rarely used, but required for "toFilter()"
    function rgbaToArgbHex(r, g, b, a) {

        var hex = [
            pad2(convertDecimalToHex(a)),
            pad2(mathRound(r).toString(16)),
            pad2(mathRound(g).toString(16)),
            pad2(mathRound(b).toString(16))
        ];

        return hex.join("");
    }

    // `equals`
    // Can be called with any tinycolor input
    tinycolor.equals = function (color1, color2) {
        if (!color1 || !color2) { return false; }
        return tinycolor(color1).toRgbString() == tinycolor(color2).toRgbString();
    };

    tinycolor.random = function() {
        return tinycolor.fromRatio({
            r: mathRandom(),
            g: mathRandom(),
            b: mathRandom()
        });
    };


    // Modification Functions
    // ----------------------
    // Thanks to less.js for some of the basics here
    // <https://github.com/cloudhead/less.js/blob/master/lib/less/functions.js>

    function desaturate(color, amount) {
        amount = (amount === 0) ? 0 : (amount || 10);
        var hsl = tinycolor(color).toHsl();
        hsl.s -= amount / 100;
        hsl.s = clamp01(hsl.s);
        return tinycolor(hsl);
    }

    function saturate(color, amount) {
        amount = (amount === 0) ? 0 : (amount || 10);
        var hsl = tinycolor(color).toHsl();
        hsl.s += amount / 100;
        hsl.s = clamp01(hsl.s);
        return tinycolor(hsl);
    }

    function greyscale(color) {
        return tinycolor(color).desaturate(100);
    }

    function lighten (color, amount) {
        amount = (amount === 0) ? 0 : (amount || 10);
        var hsl = tinycolor(color).toHsl();
        hsl.l += amount / 100;
        hsl.l = clamp01(hsl.l);
        return tinycolor(hsl);
    }

    function brighten(color, amount) {
        amount = (amount === 0) ? 0 : (amount || 10);
        var rgb = tinycolor(color).toRgb();
        rgb.r = mathMax(0, mathMin(255, rgb.r - mathRound(255 * - (amount / 100))));
        rgb.g = mathMax(0, mathMin(255, rgb.g - mathRound(255 * - (amount / 100))));
        rgb.b = mathMax(0, mathMin(255, rgb.b - mathRound(255 * - (amount / 100))));
        return tinycolor(rgb);
    }

    function darken (color, amount) {
        amount = (amount === 0) ? 0 : (amount || 10);
        var hsl = tinycolor(color).toHsl();
        hsl.l -= amount / 100;
        hsl.l = clamp01(hsl.l);
        return tinycolor(hsl);
    }

    // Spin takes a positive or negative amount within [-360, 360] indicating the change of hue.
    // Values outside of this range will be wrapped into this range.
    function spin(color, amount) {
        var hsl = tinycolor(color).toHsl();
        var hue = (hsl.h + amount) % 360;
        hsl.h = hue < 0 ? 360 + hue : hue;
        return tinycolor(hsl);
    }

    // Combination Functions
    // ---------------------
    // Thanks to jQuery xColor for some of the ideas behind these
    // <https://github.com/infusion/jQuery-xcolor/blob/master/jquery.xcolor.js>

    function complement(color) {
        var hsl = tinycolor(color).toHsl();
        hsl.h = (hsl.h + 180) % 360;
        return tinycolor(hsl);
    }

    function triad(color) {
        var hsl = tinycolor(color).toHsl();
        var h = hsl.h;
        return [
            tinycolor(color),
            tinycolor({ h: (h + 120) % 360, s: hsl.s, l: hsl.l }),
            tinycolor({ h: (h + 240) % 360, s: hsl.s, l: hsl.l })
        ];
    }

    function tetrad(color) {
        var hsl = tinycolor(color).toHsl();
        var h = hsl.h;
        return [
            tinycolor(color),
            tinycolor({ h: (h + 90) % 360, s: hsl.s, l: hsl.l }),
            tinycolor({ h: (h + 180) % 360, s: hsl.s, l: hsl.l }),
            tinycolor({ h: (h + 270) % 360, s: hsl.s, l: hsl.l })
        ];
    }

    function splitcomplement(color) {
        var hsl = tinycolor(color).toHsl();
        var h = hsl.h;
        return [
            tinycolor(color),
            tinycolor({ h: (h + 72) % 360, s: hsl.s, l: hsl.l}),
            tinycolor({ h: (h + 216) % 360, s: hsl.s, l: hsl.l})
        ];
    }

    function analogous(color, results, slices) {
        results = results || 6;
        slices = slices || 30;

        var hsl = tinycolor(color).toHsl();
        var part = 360 / slices;
        var ret = [tinycolor(color)];

        for (hsl.h = ((hsl.h - (part * results >> 1)) + 720) % 360; --results; ) {
            hsl.h = (hsl.h + part) % 360;
            ret.push(tinycolor(hsl));
        }
        return ret;
    }

    function monochromatic(color, results) {
        results = results || 6;
        var hsv = tinycolor(color).toHsv();
        var h = hsv.h, s = hsv.s, v = hsv.v;
        var ret = [];
        var modification = 1 / results;

        while (results--) {
            ret.push(tinycolor({ h: h, s: s, v: v}));
            v = (v + modification) % 1;
        }

        return ret;
    }

    // Utility Functions
    // ---------------------

    tinycolor.mix = function(color1, color2, amount) {
        amount = (amount === 0) ? 0 : (amount || 50);

        var rgb1 = tinycolor(color1).toRgb();
        var rgb2 = tinycolor(color2).toRgb();

        var p = amount / 100;

        var rgba = {
            r: ((rgb2.r - rgb1.r) * p) + rgb1.r,
            g: ((rgb2.g - rgb1.g) * p) + rgb1.g,
            b: ((rgb2.b - rgb1.b) * p) + rgb1.b,
            a: ((rgb2.a - rgb1.a) * p) + rgb1.a
        };

        return tinycolor(rgba);
    };


    // Readability Functions
    // ---------------------
    // <http://www.w3.org/TR/2008/REC-WCAG20-20081211/#contrast-ratiodef (WCAG Version 2)

    // `contrast`
    // Analyze the 2 colors and returns the color contrast defined by (WCAG Version 2)
    tinycolor.readability = function(color1, color2) {
        var c1 = tinycolor(color1);
        var c2 = tinycolor(color2);
        return (Math.max(c1.getLuminance(),c2.getLuminance())+0.05) / (Math.min(c1.getLuminance(),c2.getLuminance())+0.05);
    };

    // `isReadable`
    // Ensure that foreground and background color combinations meet WCAG2 guidelines.
    // The third argument is an optional Object.
    //      the 'level' property states 'AA' or 'AAA' - if missing or invalid, it defaults to 'AA';
    //      the 'size' property states 'large' or 'small' - if missing or invalid, it defaults to 'small'.
    // If the entire object is absent, isReadable defaults to {level:"AA",size:"small"}.

    // *Example*
    //    tinycolor.isReadable("#000", "#111") => false
    //    tinycolor.isReadable("#000", "#111",{level:"AA",size:"large"}) => false
    tinycolor.isReadable = function(color1, color2, wcag2) {
        var readability = tinycolor.readability(color1, color2);
        var wcag2Parms, out;

        out = false;

        wcag2Parms = validateWCAG2Parms(wcag2);
        switch (wcag2Parms.level + wcag2Parms.size) {
            case "AAsmall":
            case "AAAlarge":
                out = readability >= 4.5;
                break;
            case "AAlarge":
                out = readability >= 3;
                break;
            case "AAAsmall":
                out = readability >= 7;
                break;
        }
        return out;

    };

    // `mostReadable`
    // Given a base color and a list of possible foreground or background
    // colors for that base, returns the most readable color.
    // Optionally returns Black or White if the most readable color is unreadable.
    // *Example*
    //    tinycolor.mostReadable(tinycolor.mostReadable("#123", ["#124", "#125"],{includeFallbackColors:false}).toHexString(); // "#112255"
    //    tinycolor.mostReadable(tinycolor.mostReadable("#123", ["#124", "#125"],{includeFallbackColors:true}).toHexString();  // "#ffffff"
    //    tinycolor.mostReadable("#a8015a", ["#faf3f3"],{includeFallbackColors:true,level:"AAA",size:"large"}).toHexString(); // "#faf3f3"
    //    tinycolor.mostReadable("#a8015a", ["#faf3f3"],{includeFallbackColors:true,level:"AAA",size:"small"}).toHexString(); // "#ffffff"
    tinycolor.mostReadable = function(baseColor, colorList, args) {
        var bestColor = null;
        var bestScore = 0;
        var readability;
        var includeFallbackColors, level, size ;
        args = args || {};
        includeFallbackColors = args.includeFallbackColors ;
        level = args.level;
        size = args.size;

        for (var i= 0; i < colorList.length ; i++) {
            readability = tinycolor.readability(baseColor, colorList[i]);
            if (readability > bestScore) {
                bestScore = readability;
                bestColor = tinycolor(colorList[i]);
            }
        }

        if (tinycolor.isReadable(baseColor, bestColor, {"level":level,"size":size}) || !includeFallbackColors) {
            return bestColor;
        }
        else {
            args.includeFallbackColors=false;
            return tinycolor.mostReadable(baseColor,["#fff", "#000"],args);
        }
    };


    // Big List of Colors
    // ------------------
    // <http://www.w3.org/TR/css3-color/#svg-color>
    var names = tinycolor.names = {
        aliceblue: "f0f8ff",
        antiquewhite: "faebd7",
        aqua: "0ff",
        aquamarine: "7fffd4",
        azure: "f0ffff",
        beige: "f5f5dc",
        bisque: "ffe4c4",
        black: "000",
        blanchedalmond: "ffebcd",
        blue: "00f",
        blueviolet: "8a2be2",
        brown: "a52a2a",
        burlywood: "deb887",
        burntsienna: "ea7e5d",
        cadetblue: "5f9ea0",
        chartreuse: "7fff00",
        chocolate: "d2691e",
        coral: "ff7f50",
        cornflowerblue: "6495ed",
        cornsilk: "fff8dc",
        crimson: "dc143c",
        cyan: "0ff",
        darkblue: "00008b",
        darkcyan: "008b8b",
        darkgoldenrod: "b8860b",
        darkgray: "a9a9a9",
        darkgreen: "006400",
        darkgrey: "a9a9a9",
        darkkhaki: "bdb76b",
        darkmagenta: "8b008b",
        darkolivegreen: "556b2f",
        darkorange: "ff8c00",
        darkorchid: "9932cc",
        darkred: "8b0000",
        darksalmon: "e9967a",
        darkseagreen: "8fbc8f",
        darkslateblue: "483d8b",
        darkslategray: "2f4f4f",
        darkslategrey: "2f4f4f",
        darkturquoise: "00ced1",
        darkviolet: "9400d3",
        deeppink: "ff1493",
        deepskyblue: "00bfff",
        dimgray: "696969",
        dimgrey: "696969",
        dodgerblue: "1e90ff",
        firebrick: "b22222",
        floralwhite: "fffaf0",
        forestgreen: "228b22",
        fuchsia: "f0f",
        gainsboro: "dcdcdc",
        ghostwhite: "f8f8ff",
        gold: "ffd700",
        goldenrod: "daa520",
        gray: "808080",
        green: "008000",
        greenyellow: "adff2f",
        grey: "808080",
        honeydew: "f0fff0",
        hotpink: "ff69b4",
        indianred: "cd5c5c",
        indigo: "4b0082",
        ivory: "fffff0",
        khaki: "f0e68c",
        lavender: "e6e6fa",
        lavenderblush: "fff0f5",
        lawngreen: "7cfc00",
        lemonchiffon: "fffacd",
        lightblue: "add8e6",
        lightcoral: "f08080",
        lightcyan: "e0ffff",
        lightgoldenrodyellow: "fafad2",
        lightgray: "d3d3d3",
        lightgreen: "90ee90",
        lightgrey: "d3d3d3",
        lightpink: "ffb6c1",
        lightsalmon: "ffa07a",
        lightseagreen: "20b2aa",
        lightskyblue: "87cefa",
        lightslategray: "789",
        lightslategrey: "789",
        lightsteelblue: "b0c4de",
        lightyellow: "ffffe0",
        lime: "0f0",
        limegreen: "32cd32",
        linen: "faf0e6",
        magenta: "f0f",
        maroon: "800000",
        mediumaquamarine: "66cdaa",
        mediumblue: "0000cd",
        mediumorchid: "ba55d3",
        mediumpurple: "9370db",
        mediumseagreen: "3cb371",
        mediumslateblue: "7b68ee",
        mediumspringgreen: "00fa9a",
        mediumturquoise: "48d1cc",
        mediumvioletred: "c71585",
        midnightblue: "191970",
        mintcream: "f5fffa",
        mistyrose: "ffe4e1",
        moccasin: "ffe4b5",
        navajowhite: "ffdead",
        navy: "000080",
        oldlace: "fdf5e6",
        olive: "808000",
        olivedrab: "6b8e23",
        orange: "ffa500",
        orangered: "ff4500",
        orchid: "da70d6",
        palegoldenrod: "eee8aa",
        palegreen: "98fb98",
        paleturquoise: "afeeee",
        palevioletred: "db7093",
        papayawhip: "ffefd5",
        peachpuff: "ffdab9",
        peru: "cd853f",
        pink: "ffc0cb",
        plum: "dda0dd",
        powderblue: "b0e0e6",
        purple: "800080",
        rebeccapurple: "663399",
        red: "f00",
        rosybrown: "bc8f8f",
        royalblue: "4169e1",
        saddlebrown: "8b4513",
        salmon: "fa8072",
        sandybrown: "f4a460",
        seagreen: "2e8b57",
        seashell: "fff5ee",
        sienna: "a0522d",
        silver: "c0c0c0",
        skyblue: "87ceeb",
        slateblue: "6a5acd",
        slategray: "708090",
        slategrey: "708090",
        snow: "fffafa",
        springgreen: "00ff7f",
        steelblue: "4682b4",
        tan: "d2b48c",
        teal: "008080",
        thistle: "d8bfd8",
        tomato: "ff6347",
        turquoise: "40e0d0",
        violet: "ee82ee",
        wheat: "f5deb3",
        white: "fff",
        whitesmoke: "f5f5f5",
        yellow: "ff0",
        yellowgreen: "9acd32"
    };

    // Make it easy to access colors via `hexNames[hex]`
    var hexNames = tinycolor.hexNames = flip(names);


    // Utilities
    // ---------

    // `{ 'name1': 'val1' }` becomes `{ 'val1': 'name1' }`
    function flip(o) {
        var flipped = { };
        for (var i in o) {
            if (o.hasOwnProperty(i)) {
                flipped[o[i]] = i;
            }
        }
        return flipped;
    }

    // Return a valid alpha value [0,1] with all invalid values being set to 1
    function boundAlpha(a) {
        a = parseFloat(a);

        if (isNaN(a) || a < 0 || a > 1) {
            a = 1;
        }

        return a;
    }

    // Take input from [0, n] and return it as [0, 1]
    function bound01(n, max) {
        if (isOnePointZero(n)) { n = "100%"; }

        var processPercent = isPercentage(n);
        n = mathMin(max, mathMax(0, parseFloat(n)));

        // Automatically convert percentage into number
        if (processPercent) {
            n = parseInt(n * max, 10) / 100;
        }

        // Handle floating point rounding errors
        if ((Math.abs(n - max) < 0.000001)) {
            return 1;
        }

        // Convert into [0, 1] range if it isn't already
        return (n % max) / parseFloat(max);
    }

    // Force a number between 0 and 1
    function clamp01(val) {
        return mathMin(1, mathMax(0, val));
    }

    // Parse a base-16 hex value into a base-10 integer
    function parseIntFromHex(val) {
        return parseInt(val, 16);
    }

    // Need to handle 1.0 as 100%, since once it is a number, there is no difference between it and 1
    // <http://stackoverflow.com/questions/7422072/javascript-how-to-detect-number-as-a-decimal-including-1-0>
    function isOnePointZero(n) {
        return typeof n == "string" && n.indexOf('.') != -1 && parseFloat(n) === 1;
    }

    // Check to see if string passed in is a percentage
    function isPercentage(n) {
        return typeof n === "string" && n.indexOf('%') != -1;
    }

    // Force a hex value to have 2 characters
    function pad2(c) {
        return c.length == 1 ? '0' + c : '' + c;
    }

    // Replace a decimal with it's percentage value
    function convertToPercentage(n) {
        if (n <= 1) {
            n = (n * 100) + "%";
        }

        return n;
    }

    // Converts a decimal to a hex value
    function convertDecimalToHex(d) {
        return Math.round(parseFloat(d) * 255).toString(16);
    }
    // Converts a hex value to a decimal
    function convertHexToDecimal(h) {
        return (parseIntFromHex(h) / 255);
    }

    var matchers = (function() {

        // <http://www.w3.org/TR/css3-values/#integers>
        var CSS_INTEGER = "[-\\+]?\\d+%?";

        // <http://www.w3.org/TR/css3-values/#number-value>
        var CSS_NUMBER = "[-\\+]?\\d*\\.\\d+%?";

        // Allow positive/negative integer/number.  Don't capture the either/or, just the entire outcome.
        var CSS_UNIT = "(?:" + CSS_NUMBER + ")|(?:" + CSS_INTEGER + ")";

        // Actual matching.
        // Parentheses and commas are optional, but not required.
        // Whitespace can take the place of commas or opening paren
        var PERMISSIVE_MATCH3 = "[\\s|\\(]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")\\s*\\)?";
        var PERMISSIVE_MATCH4 = "[\\s|\\(]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")\\s*\\)?";

        return {
            CSS_UNIT: new RegExp(CSS_UNIT),
            rgb: new RegExp("rgb" + PERMISSIVE_MATCH3),
            rgba: new RegExp("rgba" + PERMISSIVE_MATCH4),
            hsl: new RegExp("hsl" + PERMISSIVE_MATCH3),
            hsla: new RegExp("hsla" + PERMISSIVE_MATCH4),
            hsv: new RegExp("hsv" + PERMISSIVE_MATCH3),
            hsva: new RegExp("hsva" + PERMISSIVE_MATCH4),
            hex3: /^#?([0-9a-fA-F]{1})([0-9a-fA-F]{1})([0-9a-fA-F]{1})$/,
            hex6: /^#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/,
            hex4: /^#?([0-9a-fA-F]{1})([0-9a-fA-F]{1})([0-9a-fA-F]{1})([0-9a-fA-F]{1})$/,
            hex8: /^#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/
        };
    })();

    // `isValidCSSUnit`
    // Take in a single string / number and check to see if it looks like a CSS unit
    // (see `matchers` above for definition).
    function isValidCSSUnit(color) {
        return !!matchers.CSS_UNIT.exec(color);
    }

    // `stringInputToObject`
    // Permissive string parsing.  Take in a number of formats, and output an object
    // based on detected format.  Returns `{ r, g, b }` or `{ h, s, l }` or `{ h, s, v}`
    function stringInputToObject(color) {

        color = color.replace(trimLeft,'').replace(trimRight, '').toLowerCase();
        var named = false;
        if (names[color]) {
            color = names[color];
            named = true;
        }
        else if (color == 'transparent') {
            return { r: 0, g: 0, b: 0, a: 0, format: "name" };
        }

        // Try to match string input using regular expressions.
        // Keep most of the number bounding out of this function - don't worry about [0,1] or [0,100] or [0,360]
        // Just return an object and let the conversion functions handle that.
        // This way the result will be the same whether the tinycolor is initialized with string or object.
        var match;
        if ((match = matchers.rgb.exec(color))) {
            return { r: match[1], g: match[2], b: match[3] };
        }
        if ((match = matchers.rgba.exec(color))) {
            return { r: match[1], g: match[2], b: match[3], a: match[4] };
        }
        if ((match = matchers.hsl.exec(color))) {
            return { h: match[1], s: match[2], l: match[3] };
        }
        if ((match = matchers.hsla.exec(color))) {
            return { h: match[1], s: match[2], l: match[3], a: match[4] };
        }
        if ((match = matchers.hsv.exec(color))) {
            return { h: match[1], s: match[2], v: match[3] };
        }
        if ((match = matchers.hsva.exec(color))) {
            return { h: match[1], s: match[2], v: match[3], a: match[4] };
        }
        if ((match = matchers.hex8.exec(color))) {
            return {
                r: parseIntFromHex(match[1]),
                g: parseIntFromHex(match[2]),
                b: parseIntFromHex(match[3]),
                a: convertHexToDecimal(match[4]),
                format: named ? "name" : "hex8"
            };
        }
        if ((match = matchers.hex6.exec(color))) {
            return {
                r: parseIntFromHex(match[1]),
                g: parseIntFromHex(match[2]),
                b: parseIntFromHex(match[3]),
                format: named ? "name" : "hex"
            };
        }
        if ((match = matchers.hex4.exec(color))) {
            return {
                r: parseIntFromHex(match[1] + '' + match[1]),
                g: parseIntFromHex(match[2] + '' + match[2]),
                b: parseIntFromHex(match[3] + '' + match[3]),
                a: convertHexToDecimal(match[4] + '' + match[4]),
                format: named ? "name" : "hex8"
            };
        }
        if ((match = matchers.hex3.exec(color))) {
            return {
                r: parseIntFromHex(match[1] + '' + match[1]),
                g: parseIntFromHex(match[2] + '' + match[2]),
                b: parseIntFromHex(match[3] + '' + match[3]),
                format: named ? "name" : "hex"
            };
        }

        return false;
    }

    function validateWCAG2Parms(parms) {
        // return valid WCAG2 parms for isReadable.
        // If input parms are invalid, return {"level":"AA", "size":"small"}
        var level, size;
        parms = parms || {"level":"AA", "size":"small"};
        level = (parms.level || "AA").toUpperCase();
        size = (parms.size || "small").toLowerCase();
        if (level !== "AA" && level !== "AAA") {
            level = "AA";
        }
        if (size !== "small" && size !== "large") {
            size = "small";
        }
        return {"level":level, "size":size};
    }

    return tinycolor;

    })(Math);

    return SplunkVisualizationBase.extend(vizObj);
});