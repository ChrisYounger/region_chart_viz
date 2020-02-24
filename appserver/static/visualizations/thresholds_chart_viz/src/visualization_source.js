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
            viz.instance_id = "thresholds_chart_viz_" + Math.round(Math.random() * 1000000);
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
            viz.$container_wrap.addClass("thresholds_chart_viz-container");
        },

        formatData: function(data) {
            return data;
        },

        updateView: function(data, config) {
            var viz = this;
            viz.config = {
                type: "line",
                nulls: "gap",
                last_text: "hide",
                summ_text: "hide",
                xtitle_show: "hide",
                xtitle_text: "",
                ytitle_show: "hide",
                status_dots: "hide",
                ytitle_text: "",
                line_size: "3",
                line_color: "#000000",
                min: "",
                max: "",
                textprecision: "nolimit",
                threshold_opacity: "50",
                color_critical: "#B50101",
                color_high: "#F26A35",
                color_medium: "#FCB64E",
                color_low: "#FFE98C",
                color_normal: "#99D18B",
                color_info: "#AED3E5"
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
            return sev=="critical" ? viz.config.color_critical 
                    : sev=="high" ? viz.config.color_high
                    : sev=="medium" ? viz.config.color_medium 
                    : sev=="low" ? viz.config.color_low 
                    : sev=="normal" ? viz.config.color_normal 
                    : sev=="info" ? viz.config.color_info
                    // Assume a colour has been provided. 
                    : sev; 
        },

        formatWithPrecision: function(val){
            var viz = this;
            if (viz.config.textprecision === "nolimit") {
                return val;
            } else if (viz.config.textprecision === "1") {
                return Math.round(val);
            } else if (viz.config.textprecision === "2") {
                return Math.round(val * 10) / 10;
            } else if (viz.config.textprecision === "3") {
                return Math.round(val * 100) / 100;
            } else if (viz.config.textprecision === "4") {
                return Math.round(val * 1000) / 1000;
            } else if (viz.config.textprecision === "5") {
                return Math.round(val * 10000) / 10000;
            } else if (viz.config.textprecision === "6") {
                return Math.round(val * 100000) / 100000;
            }
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
            if (!(viz.$container_wrap.height() > 0)) {
                return;
            }

            // #################################################################################################################
            // SVG Setup

            var margin = {top: 10, right: 40, bottom: 30, left: 60};
            if (viz.config.xtitle_show !== "hide") {
                margin.bottom = 50;
            }
            if (viz.config.ytitle_show !== "hide") {
                margin.left = 80;
            }
            var width = viz.$container_wrap.width() - margin.left - margin.right;
            var height = viz.$container_wrap.height() - margin.top - margin.bottom;

            // append the svg object to the body of the page
            var svgmain = d3.create("svg")
                .attr("width", width + margin.left + margin.right)
                .attr("height", height + margin.top + margin.bottom);
            var svg = svgmain.append("g")
                .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
                viz.$container_wrap.empty().append(svgmain.node());
            //var svg_node = viz.$container_wrap.children();


// TODO allow a trendline
            // #################################################################################################################
            // Data processing

            var field1 = viz.data.fields[0].name;
            var field2 = viz.data.fields[1].name;
            var datamin_y = null;
            var datamax_y = null;
            var datamin_x = null;
            var datamax_x = null;
            // TODO should these be local variables
            viz.data_processed = [];
            viz.data_orphans = [];
            viz.status_dots = [];
            viz.thresholds = [];
            var just_gapped = true;
            var just_added = false;
            var summary_total = 0;
            var summary_count = 0;
            for (var k = 0; k < viz.data.results.length; k++) {
                // TODO  only currently supports time on bottom axis
                var record = {
                    x: new Date(viz.data.results[k][field1]),
                    row: k
                };
                if (datamin_x === null) {
                    datamin_x = record.x;
                }
                datamax_x = record.x;
                viz.thresholds[k] = {stops: [], sevs: []};
                if (viz.data.results[k].hasOwnProperty("thresholds")) {
                    var match_row_thresholds = /thresholds=\"([^\"]*)/.exec(viz.data.results[k].thresholds);
                    var match_row_thresholds_arr = [];
                    if (match_row_thresholds[1] !== null) {
                        match_row_thresholds_arr = match_row_thresholds[1].split(",")
                    }
                    var match_row_severities = /severities=\"([^\"]*)/.exec(viz.data.results[k].thresholds);
                    var match_row_severities_arr = [];
                    if (match_row_severities[1] !== null) {
                        match_row_severities_arr = match_row_severities[1].split(",")
                    }
                    if (match_row_severities_arr.length > 0 || match_row_thresholds_arr.length > 0) {
                        // only save these if they are vaid (1 more severity than stops)
                        if (match_row_severities_arr.length === (match_row_thresholds_arr.length + 1)) {
                            viz.thresholds[k].sevs = match_row_severities_arr;
                            viz.thresholds[k].stops = match_row_thresholds_arr;
                        } else {
                            console.log("Line " + (k + 1) + ". mismatch in lengths of severities [" + match_row_severities_arr.length + "] and thresholds [" + match_row_thresholds_arr.length + "]. threshold ignored.");
                        }
                    }
                }
                if (viz.data.results[k].hasOwnProperty(field2)) {
                    record.y = (+ viz.data.results[k][field2]);
                    summary_count++;
                    summary_total += record.y;
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
                            viz.data_orphans.pop(record);
                        }
                        if (just_gapped) {
                            viz.data_orphans.push(record);
                            just_added = true;
                        } else {
                            just_added = false;
                        }
                        just_gapped = false;
                    }
                }
                // do the status dots
                var statusdot = null;
                if (record.y !== null) {
                    for(var n = 0; n < viz.thresholds[k].sevs.length; n++) {
                        statusdot = viz.thresholds[k].sevs[n];
                        if (n >= viz.thresholds[k].stops.length || record.y < (+ viz.thresholds[k].stops[n])) {
                            break;
                        }
                    }
                }
                // status dots are still included if they are null (becuase column might not have thresholds). 
                // dots are not included if there is a gap in data
                if (record.y !== null) {
                    viz.status_dots.push({ 
                        x: record.x,
                        y: record.y,
                        sev: statusdot
                    });
                    record.sev = statusdot;
                } 
                viz.data_processed.push(record);
            }

console.log("outdata:", viz.data_processed)


            // #################################################################################################################
            // Draw the Axis

            // Add bottom X axis --> it is usually a date format
            var x = d3.scaleTime()
                //Instead of using d3.extent we  make sure that we use the input data. becuase points may get dropped from the processed_data array
                .domain([datamin_x, datamax_x])
                .range([ 0, width ]);
            svg.append("g")
                .attr("transform", "translate(0," + height + ")")
                .call(d3.axisBottom(x))
                // Fix the colour on the tick marks
                .call(function(g) { return g.select(".domain").attr("stroke","#c3cbd4"); })
                // remove the D3 font styling
                .call(function(g) { return g.attr("font-family", "").attr("font-size", "11px") });

            // Add left Y axis
            var y = d3.scaleLinear()
                .domain([viz.config.min !== "" ? (+ viz.config.min) : datamin_y, viz.config.max !== "" ? (+ viz.config.max) : datamax_y])
                .range([height, 0])
                .nice();
            svg.append("g")
                .call(d3.axisLeft(y))
                .call(function(g) { return g.select(".domain").remove(); })
                //  extend the tick line
                .call(function(g) { return g.selectAll(".tick:not(:first-of-type) line").attr("x1", width).attr("stroke", (viz.theme === 'light' ? "#e1e6eb" : "#324147" ))})
                // change the color on the last tick
                .call(function(g) { return g.selectAll(".tick:first-of-type line").attr("stroke","#c3cbd4")})
                // remove the D3 font styling so it will inherit
                .call(function(g) { return g.attr("font-family", "").attr("font-size", "11px")});

            // Add axis titles
            if (viz.config.xtitle_show !== "hide") {
                svg.append("text")
                    .attr("text-anchor", "middle")
                    .attr("y", height + 40)
                    .attr("x", width / 2)
                    // TODO if supporting multiple data series then this will need to default to blank
                    .text(viz.config.xtitle_text === "" ? field1 : viz.config.xtitle_text);
            }
            if (viz.config.ytitle_show !== "hide") {
                svg.append("text")
                    .attr("text-anchor", "middle")
                    .attr("y", -60)
                    .attr("x", height * -0.5)
                    .attr("width", height)
                    .attr("height", 20)
                    .attr("transform", "rotate(270 " + 0 + " " + 0 + ")")
                    .text(viz.config.ytitle_text === "" ? field2 : viz.config.ytitle_text);
            }

            // #################################################################################################################
            // Calculate and draw the thresholds

            // compute the regions now that the y axis has been setup
            var thresholds = [];

            // TODO fix these limits
            var limit_bottom = -99999999;
            var limit_top = 99999999;
            var col_width = 10;
            // assume blocks are evenly spaced
            if (viz.data.results.length > 1) {
                // TODO fix date assumption
                col_width = x(new Date(viz.data.results[1][field1])) - x(new Date(viz.data.results[0][field1]));
            }
            var skips = 1;
            for (var i = 0; i < viz.data.results.length; i += skips) {
                // if the thresholds are exactly the same for multiple rows then they will be collapsed (quick string comparison)
                for (skips = 1; (i + skips) < viz.data.results.length; skips++){
                    if (viz.data.results[i].thresholds !== viz.data.results[(i + skips)].thresholds) {
                        break;
                    }
                }
                // There should always be one more severity than there is stops
                for (var j = 0; j < viz.thresholds[i].sevs.length; j++) {
                    var d = {
                        "sev": viz.thresholds[i].sevs[j],
                        // TODO fix date assumption
                        "left": x(new Date(viz.data.results[i][field1])),
                        "from": Math.min(Math.max(y(j === 0 ? limit_bottom :  + viz.thresholds[i].stops[j-1]), 0), height),
                        "to": Math.min(Math.max(y(j >= viz.thresholds[i].stops.length ? limit_top : + viz.thresholds[i].stops[j]), 0), height),
                        "width": skips, 
                    }
                    d.height = d.from - d.to;
                    if (d.height > 0){
                        thresholds.push(d);
                    }
                }
                
            }

            // add the threshold regions underneath
            svg.selectAll(".region")
                .data(thresholds)
                .enter()
                    .append("rect") 
                    .attr("fill", function(d) { return viz.getSeverityColor(d.sev); })
                    .attr("opacity", viz.config.threshold_opacity / 100)
                    .attr("x", function(d) { return d.left; })
                    .attr("y", function(d) { return d.to; })
                    .attr("width", function(d) { var avail = width - d.left; return Math.min(avail + 14,  d.width * col_width);})
                    .attr("height", function(d) { return d.height; })



            // #################################################################################################################
            // Draw the Line

            // TODO updating with animations
            var dline = d3.line()
                .defined(function(d) { return d.y !== null })
                .x(function(d) { return x(d.x) })
                .y(function(d) { return y(d.y) });
            if (viz.config.type === "curve") {
                dline.curve(d3.curveMonotoneX);
            } else if (viz.config.type === "step") {
                dline.curve(d3.curveStep);
            }

            svg.append("path")
                .datum(viz.data_processed)
                .attr("fill", "none")
                .attr("stroke", viz.config.line_color)
                .attr("stroke-width", viz.config.line_size)
                .attr("d", dline);

            // Appends a circle for each orphaned datapoint (a line that has gaps on both sides)
            svg.selectAll(".dot")
                .data(viz.data_orphans)
                .enter()
                    .filter(function(d) { return d.y !== null })
                    .append("circle") // Uses the enter().append() method
                    .attr("class", "dot") // Assign a class for styling
                    .attr("fill", viz.config.line_color) //,viz.colors[0]) 
                    //.attr("stroke", "white")
                    .attr("cx", function(d, i) { return x(d.x) })
                    .attr("cy", function(d) { return y(d.y) })
                    .attr("r", viz.config.line_size)

            // Appends a status circle for each datapoint 
            if (viz.config.status_dots !== "hide") {
                svg.selectAll(".sdot")
                    .data(viz.status_dots)
                    .enter()
                        //.filter(function(d) { return d.y !== null })
                        .append("circle") // Uses the enter().append() method
                        .attr("class", "sdot") // Assign a class for styling
                        .attr("fill", function(d){ return d.sev === null ? viz.config.line_color : viz.getSeverityColor(d.sev); })
                        .attr("stroke", viz.config.line_color) //viz.colors[0])
                        .attr("cx", function(d, i) { return x(d.x) })
                        .attr("cy", function(d) { return y(d.y) })
                        .attr("r", viz.config.line_size);
            }



            // #################################################################################################################
            // Tooltip stuff

            // TODO tooltip should show the current status
            var tooltip = $("<div class=\"thresholds_chart_viz-tooltip\"><table><tbody><tr><td colspan=\"3\" class=\"thresholds_chart_viz-tooltip_date\"></td></tr><tr><td class=\"thresholds_chart_viz-tooltip_name\"></td><td class=\"thresholds_chart_viz-tooltip_sev\"></td><td class=\"thresholds_chart_viz-tooltip_value\"></td></tr></tbody></table></div>").appendTo(viz.$container_wrap);
            var tooltip_date = tooltip.find(".thresholds_chart_viz-tooltip_date");
            var tooltip_name = tooltip.find(".thresholds_chart_viz-tooltip_name");
            var tooltip_value = tooltip.find(".thresholds_chart_viz-tooltip_value");
            var tooltip_sev = tooltip.find(".thresholds_chart_viz-tooltip_sev");
            var tooltip_body = tooltip.find("tbody");

            // This allows to find the closest X index of the mouse:
            var bisect = d3.bisector(function(d) { return d.x; }).left;

            // Create a rect on top of the svg area: this rectangle recovers mouse position
            svg.append('rect')
                .style("fill", "none")
                .style("pointer-events", "all")
                .attr('width', width)
                .attr('height', height)
                .on('mouseover', mouseover)
                .on('mousemove', mousemove)
                .on('mouseout', mouseout);

            // Create the circle that travels along the curve of chart
            var focus = svg
                .append('g')
                .append('circle')
                .style("pointer-events", "none")
                .style("fill", "none")
                .attr("stroke", viz.config.line_color) //viz.colors[0])
                .attr("stroke-opacity", 0.3)
                .attr("stroke-width", 3)
                .attr('r', (4 + Number(viz.config.line_size)))
                .style("opacity", 0)

            // What happens when the mouse move -> show the annotations at the right positions.
            function mouseover() {
                focus.style("opacity", 1)
                tooltip.css("opacity", 1)
            }

            function mousemove() {
                // recover coordinate we need
                var x0 = x.invert(d3.mouse(this)[0]);
                var i = bisect(viz.data_processed, x0, 1);
                selectedData = viz.data_processed[i];
                if (selectedData.y !== null ) {
                    focus
                        .attr("cx", x(selectedData.x))
                        .attr("cy", y(selectedData.y))
                    // TODO might not be date axis
                    var datefmt = new Date(selectedData.x);
                    tooltip_date.text(datefmt.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short',  year: 'numeric', hour:"2-digit", minute:"2-digit", second:"2-digit" }));
                    tooltip_name.text(field2);
                    tooltip_value.text(viz.formatWithPrecision(selectedData.y));
                    if (selectedData.sev !== null) {
                        tooltip_sev.html("<span class='thresholds_chart_viz-tooltip_colorbox' style='background-color:" + viz.getSeverityColor(selectedData.sev) + "'></span> " + selectedData.sev);
                    } else {
                        tooltip_sev.html("");
                    }
                    tooltip_body.find(".thresholds_chart_viz-tooltip_extrarow").remove();
                    var tt_str = "";
                    // add details of the threhsolds here
                    for (var j = viz.thresholds[selectedData.row].sevs.length - 1; j >= 0; j--) {
                        tt_str += "<tr class='thresholds_chart_viz-tooltip_extrarow'><td></td><td class='thresholds_chart_viz-tooltip_tcell'><span class='thresholds_chart_viz-tooltip_colorbox' style='background-color:" + viz.getSeverityColor(viz.thresholds[selectedData.row].sevs[j]) + "'></span> " + viz.thresholds[selectedData.row].sevs[j] + "</td><td class='thresholds_chart_viz-tooltip_th'>" + (j > 0 ? viz.formatWithPrecision(viz.thresholds[selectedData.row].stops[j - 1]) : "") + "</td></tr>";
                    }
                    tooltip_body.append($(tt_str));
                    var top = y(selectedData.y);
                    var tt_height = (50 + (viz.thresholds[selectedData.row].sevs.length * 22));
                    //position the box about the middle, but limit when near top or bottom
                    tooltip.css("top", Math.min((height - tt_height), Math.max(margin.top + 2, top - (tt_height / 2))));
                    // show on the left or right of point depending on whcih side of the chart we are on
                    var left = x(selectedData.x);
                    if (left < width / 2){ 
                        tooltip.css({"left": left + 100, "right": ""});
                    } else {
                        tooltip.css({"left": "", "right": width - left + 80});
                    }
                }
            }

            function mouseout() {
                focus.style("opacity", 0)
                tooltip.css("opacity", 0)
            }


            // #################################################################################################################
            // Draw the overlay values

            var overlay_text_height = Math.max(12, Math.min(60, height * 0.06));
            if (viz.config.summ_text !== "hide" && summary_count > 0) {
                svg.append("text")
                    .style("pointer-events", "none")
                    .attr("font-size", overlay_text_height + "px")
                    .attr("class",(viz.theme === 'light' ? "thresholds_chart_viz-overlaytext_light" : "thresholds_chart_viz-overlaytext_dark" ))
                    .attr("y", 10 + overlay_text_height)
                    .attr("x", 20)
                    .text((viz.config.summ_text === "avg") ? "Average: " + viz.formatWithPrecision(summary_total / summary_count) : "Total: " + viz.formatWithPrecision(summary_total));
            }
            if (viz.config.last_text !== "hide") {
                var top = y(viz.data_processed[viz.data_processed.length-1].y);
                svg.append("text")
                    .style("pointer-events", "none")
                    .attr("text-anchor", "end")
                    .attr("font-size", overlay_text_height + "px")
                    .attr("class",(viz.theme === 'light' ? "thresholds_chart_viz-overlaytext_light" : "thresholds_chart_viz-overlaytext_dark" ))
                    .attr("width", 300)
                    .attr("y", (top > height / 2) ? top - overlay_text_height : top + overlay_text_height + overlay_text_height ) //Math.min((height - overlay_text_height), Math.max(margin.top + 2, top - (overlay_text_height / 2))))
                    .attr("x", x(viz.data_processed[viz.data_processed.length-1].x))
                    .text(viz.formatWithPrecision(viz.data_processed[viz.data_processed.length-1].y));

                svg.append("circle")
                    .style("pointer-events", "none")
                    .attr("fill", "none")
                    .attr("stroke-width", 3)
                    .attr("stroke-opacity", 0.3)
                    .attr("stroke", viz.config.line_color) 
                    .attr("cx", function(d, i) { return x(viz.status_dots[viz.status_dots.length-1].x) })
                    .attr("cy", function(d) { return y(viz.status_dots[viz.status_dots.length-1].y) })
                    .attr("r", Number(viz.config.line_size) + 4)
                    /*.node().animate([
                        { transform: 'scale(1)', opacity: 1},
                        { transform: 'scale(1.5)', opacity: .5 }
                    ], {
                        duration: 2000, //milliseconds
                        easing: 'ease-in-out', //'linear', a bezier curve, etc.
                        delay: 10, //milliseconds
                        iterations: Infinity, //or a number
                        direction: 'alternate', //'normal', 'reverse', etc.
                        fill: 'forwards' //'backwards', 'both', 'none', 'auto'
                    })*/ ;
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