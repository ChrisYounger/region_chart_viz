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
                type: "curve",
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
                text_precision: "-1",
                text_thousands: "no",
                text_unit: "",
                text_unit_position: "after",
                threshold_opacity: "50",
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
                viz.$container_wrap.empty().append("<div class='thresholds_chart_viz-bad_data'>Need at least 2 columns of data.<br /><a href='/app/thresholds_chart_viz/documentation' target='_blank'>Click here for examples and documentation</a></div>");
                return;
            }

            if (viz.data.results.length > (+viz.config.row_limit)) {
                viz.$container_wrap.empty().append("<div class='thresholds_chart_viz-bad_data'>Too many data points (rows=" + viz.data.results.length + ", limit=" + viz.config.row_limit + ")<br /><a href='/app/thresholds_chart_viz/documentation' target='_blank'>Click here for examples and documentation</a></div>");
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
            // Data processing

            var field1 = viz.data.fields[0].name;
            var field2 = viz.data.fields[1].name;
            var datamin_y = null;
            var datamax_y = null;
            var datamin_x = null;
            var datamax_x = null;
            var just_gapped = true;
            var just_added = false;
            var summary_total = 0;
            var summary_count = 0;
            viz.line_data = [];
            viz.line_data_last = {};
            viz.orphan_dots = [];
            viz.status_dots = [];
            viz.thresholds = [];
            viz.threshold_regions = [];
            for (var k = 0; k < viz.data.results.length; k++) {
                // if first field is _time, then treat as a date. this seems to be the logic that normal line chart uses.
                var record = {
                    x: (field1 === "_time") ? new Date(viz.data.results[k][field1]) : +viz.data.results[k][field1],
                    row: k
                };
                if (datamin_x === null) {
                    datamin_x = record.x;
                }
                datamax_x = record.x;
                viz.thresholds[k] = {stops: [], sevs: []};
                if (viz.data.results[k].hasOwnProperty("thresholds") && $.trim(viz.data.results[k].thresholds) !== "") {
                    var thresholds_arr = viz.data.results[k].thresholds.toLowerCase().split(",");
                    if ((thresholds_arr.length % 2) === 1) {
                        // only save these if they are vaid (1 more severity than stops)
                        for (var l = 0; l < thresholds_arr.length; l++){
                            // if its an odd element
                            if (l % 2 === 1) {
                                viz.thresholds[k].stops.push(thresholds_arr[l]);
                            } else {
                                viz.thresholds[k].sevs.push(thresholds_arr[l]);
                            }
                        }
                    } else if (thresholds_arr.lenghh > 0) {
                        console.log("Line " + (k + 1) + ". Error thresholds should be an odd amount of records [" + viz.data.results[k].thresholds + "]");
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
                            viz.orphan_dots.pop(record);
                        }
                        if (just_gapped) {
                            viz.orphan_dots.push(record);
                            just_added = true;
                        } else {
                            just_added = false;
                        }
                        just_gapped = false;
                    }
                }
                // do the data for the status dots
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
                viz.line_data.push(record);
                viz.line_data_last = record;
            }

            // setup the d3 scales - bottom scale
            viz.xScale = (field1 === "_time") ? d3.scaleTime() : d3.scaleLinear();
            //Instead of using d3.extent just use our own calculated values since we already went through the array
            viz.xScale.range([0, viz.width]).domain([datamin_x, datamax_x]);
            viz.xAxis = d3.axisBottom(viz.xScale);
            // left scale
            viz.yScale = d3.scaleLinear().range([viz.height, 0]).domain([viz.config.min !== "" ? (+ viz.config.min) : datamin_y, viz.config.max !== "" ? (+ viz.config.max) : datamax_y]).nice();
            viz.yAxis = d3.axisLeft(viz.yScale);
            // use about 1 tick per 80pixels of space
            viz.yAxis.ticks(viz.height / 80);

            // compute the threshold regions
            // use domain limits after nice-ing
            var limit_bottom = viz.yScale.domain()[0];
            var limit_top = viz.yScale.domain()[1];
            var col_width = 10;
            // determine the width of thresholds, assuming that blocks are evenly spaced
            if (viz.data.results.length > 1) {
                if (field1 === "_time") {
                    col_width = viz.xScale(new Date(viz.data.results[1][field1])) - viz.xScale(new Date(viz.data.results[0][field1]));
                } else {
                    col_width = viz.xScale(viz.data.results[1][field1]) - viz.xScale(viz.data.results[0][field1]);
                }
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
                        "left": viz.xScale(field1 === "_time" ? new Date(viz.data.results[i][field1]) : +viz.data.results[i][field1] ),
                        "from": Math.min(Math.max(viz.yScale(j === 0 ? limit_bottom :  + viz.thresholds[i].stops[j-1]), 0), viz.height),
                        "to": Math.min(Math.max(viz.yScale(j >= viz.thresholds[i].stops.length ? limit_top : + viz.thresholds[i].stops[j]), 0), viz.height),
                        "width": skips, 
                    };
                    d.height = d.from - d.to;
                    if (d.height > 0) {
                        viz.threshold_regions.push(d);
                    }
                }
            }


            // #################################################################################################################
            // SVG Setup

            if (viz.isFirstDraw) {
                // create and append the svg object to the body of the page
                var svgmain = d3.create("svg")
                    .attr("width", viz.width + viz.margin.left + viz.margin.right)
                    .attr("height", viz.height + viz.margin.top + viz.margin.bottom);

                viz.svg = svgmain.append("g").attr("transform", "translate(" + viz.margin.left + "," + viz.margin.top + ")");

                viz.$container_wrap.append(svgmain.node());

                // Create some svg groups to contain things
                viz.xAxisGroup = viz.svg.append("g").attr("class","thresholds_chart_viz-xaxis").attr("transform", "translate(0," + viz.height + ")");
                viz.yAxisGroup = viz.svg.append("g").attr("class","thresholds_chart_viz-yaxis");
                viz.threshold_g = viz.svg.append("g").attr("class","thresholds_chart_viz-thresholds");
                viz.line = viz.svg.append("path").attr("class","thresholds_chart_viz-line");
                viz.orphan_dots_g = viz.svg.append("g").attr("class","thresholds_chart_viz-orphan_dots");
                viz.status_dots_g = viz.svg.append("g").attr("class","thresholds_chart_viz-status_dots");

                viz.summary_text = viz.svg.append("text")
                    .attr("class", "thresholds_chart_viz-summary_text " + (viz.theme === 'light' ? "thresholds_chart_viz-overlaytext_light" : "thresholds_chart_viz-overlaytext_dark" ))
                    .style("pointer-events", "none")
                    .style("visibility", "hidden")
                    .attr("font-size", viz.overlay_text_size + "px")
                    .attr("y", 10 + viz.overlay_text_size)
                    .attr("x", 20);

                viz.last_text = viz.svg.append("text")
                    .attr("class", "thresholds_chart_viz-last_text " + (viz.theme === 'light' ? "thresholds_chart_viz-overlaytext_light" : "thresholds_chart_viz-overlaytext_dark" ))
                    .style("pointer-events", "none")
                    .style("visibility", "hidden")
                    .attr("text-anchor", "end")
                    .attr("font-size", viz.overlay_text_size + "px")
                    .attr("width", 300);

                viz.last_dot = viz.svg.append("circle")
                    .attr("class","thresholds_chart_viz-last_dot")
                    .style("visibility", "hidden")
                    .style("pointer-events", "none")
                    .attr("fill", viz.config.line_color)
                    .attr("stroke-width", 3)
                    .attr("stroke", viz.config.line_color)
                    .attr("r", Math.max(3,Number(viz.config.line_size)));

                viz.last_dot_pulse = viz.svg.append("circle")
                    .attr("class","thresholds_chart_viz-pulse1")
                    .style("visibility", "hidden")
                    .style("pointer-events", "none")
                    .attr("fill", "none")
                    .attr("stroke", viz.config.line_color)
                    .attr("r", Number(viz.config.line_size));

                // The axis titles
                if (viz.config.xtitle_show !== "hide") {
                    viz.svg.append("text")
                        .attr("text-anchor", "middle")
                        .attr("y", viz.height + 40)
                        .attr("x", viz.width / 2)
                        .text(viz.config.xtitle_text === "" ? field1 : viz.config.xtitle_text);
                }
                if (viz.config.ytitle_show !== "hide") {
                    viz.svg.append("text")
                        .attr("text-anchor", "middle")
                        .attr("y", -60)
                        .attr("x", viz.height * -0.5)
                        .attr("width", viz.height)
                        .attr("height", 20)
                        .attr("transform", "rotate(270 " + 0 + " " + 0 + ")")
                        .text(viz.config.ytitle_text === "" ? field2 : viz.config.ytitle_text);
                }
            }

            viz.xAxisGroup
                .transition()
                .duration(viz.isFirstDraw ? 0 : viz.config.transition_time)
                .call(viz.xAxis);

            viz.yAxisGroup
                .transition()
                .duration(viz.isFirstDraw ? 0 : viz.config.transition_time)
                .call(viz.yAxis)
                //  extend the tick line
                .call(function(g) { return g.selectAll(".tick:not(:first-of-type) line").attr("x1", viz.width).attr("stroke", (viz.theme === 'light' ? "#e1e6eb" : "#324147" )); });

            // add the threshold regions underneath
            var regions = viz.threshold_g.selectAll("rect")
                .data(viz.threshold_regions);
            regions.enter()
                .append("rect")
                .merge(regions)
                .transition()
                .duration(viz.isFirstDraw ? 0 : viz.config.transition_time)
                .attr("fill", function(d) { return viz.getSeverityColor(d.sev); })
                .attr("opacity", viz.config.threshold_opacity / 100)
                .attr("x", function(d) { return d.left; })
                .attr("y", function(d) { return d.to; })
                .attr("width", function(d) { return Math.min((viz.width - d.left) + 14,  d.width * col_width);})
                .attr("height", function(d) { return d.height; });
            regions.exit().remove();

            // Create a line function
            var dline = d3.line()
                .defined(function(d) { return d.y !== null; })
                .x(function(d) { return viz.xScale(d.x); })
                .y(function(d) { return viz.yScale(d.y); });
            
            // add line curve or stepping if configured
            if (viz.config.type === "curve") {
                dline.curve(d3.curveMonotoneX);
            } else if (viz.config.type === "step") {
                dline.curve(d3.curveStep);
            }

            // update the line path of the line chart
            viz.line
                .datum(viz.line_data)
                .transition()
                .duration(viz.config.transition_time)
                .attr("fill", "none")
                .attr("stroke", viz.config.line_color)
                .attr("stroke-width", viz.config.line_size)
                .attr("d", dline);

            // Appends a circle for each orphaned datapoint (a line that has gaps on both sides)
            var dots = viz.orphan_dots_g.selectAll("circle")
                .data(viz.orphan_dots);
            dots.enter()
                .filter(function(d) { return d.y !== null; })
                .append("circle")
                .attr("fill", viz.config.line_color)
                // These next two lines are here because sometimes new dots are created after inital draw and we dont want them flying across the screen.
                .attr("cx", function(d) { return viz.xScale(d.x); })
                .attr("cy", function(d) { return viz.yScale(d.y); })
                .attr("r", viz.config.line_size)
                .merge(dots)
                .transition()
                .duration(viz.config.transition_time)
                .attr("cx", function(d) { return viz.xScale(d.x); })
                .attr("cy", function(d) { return viz.yScale(d.y); });
            dots.exit().remove();

            // Appends a status circle for each datapoint 
            if (viz.config.status_dots !== "hide") {
                var sdots = viz.status_dots_g.selectAll("circle")
                    .data(viz.status_dots);
                sdots.enter()
                    .append("circle")
                    // These next two lines are here because sometimes new dots are created after inital draw and we dont want them flying across the screen.
                    .attr("cx", function(d) { return viz.xScale(d.x); })
                    .attr("cy", function(d) { return viz.yScale(d.y); })
                    .attr("r", viz.config.line_size)
                    .merge(sdots)
                    .transition()
                    .duration(viz.config.transition_time)
                    .attr("fill", function(d){ return d.sev === null ? viz.config.line_color : viz.getSeverityColor(d.sev); })
                    .attr("stroke", viz.config.line_color)
                    .attr("cx", function(d) { return viz.xScale(d.x); })
                    .attr("cy", function(d) { return viz.yScale(d.y); });
                sdots.exit().remove();
            }

            // add the summary overlay text if required
            if (viz.config.summ_text !== "hide" && summary_count > 0) {
                viz.summary_text
                    .style("visibility", "")
                    .text((viz.config.summ_text === "avg") ? "Average: " + viz.formatWithPrecision(summary_total / summary_count) : "Total: " + viz.formatWithPrecision(summary_total));
            }

            // add the last element text if required
            if (viz.config.last_text !== "hide") {
                var last_text_top = viz.yScale(viz.line_data_last.y);
                viz.last_text
                    .transition()
                    .duration(viz.isFirstDraw ? 0 : viz.config.transition_time)
                    .style("visibility", "")
                    .attr("y", (last_text_top > viz.height / 2) ? last_text_top - viz.overlay_text_size : last_text_top + viz.overlay_text_size * 2 )
                    .attr("x", viz.xScale(viz.line_data_last.x))
                    .text(viz.formatWithPrecision(viz.line_data_last.y));

                // if there isnt already status dots, then add a dot for the final element
                if (viz.config.status_dots === "hide") {
                    viz.last_dot
                        .transition()
                        .duration(viz.isFirstDraw ? 0 : viz.config.transition_time)
                        .style("visibility", "")
                        .attr("cx", viz.xScale(viz.status_dots[viz.status_dots.length-1].x) )
                        .attr("cy", viz.yScale(viz.status_dots[viz.status_dots.length-1].y) );
                }

                // add a dot that is pulsing
                viz.last_dot_pulse
                    .transition()
                    .duration(viz.isFirstDraw ? 0 : viz.config.transition_time)
                    .style("visibility", "")
                    .attr("cx", viz.xScale(viz.status_dots[viz.status_dots.length-1].x) )
                    .attr("cy", viz.yScale(viz.status_dots[viz.status_dots.length-1].y) );
            }


            // #################################################################################################################
            // Tooltip stuff

            if (viz.isFirstDraw) {
                 var tooltip = $("<div class=\"thresholds_chart_viz-tooltip\"><table><tbody><tr><td colspan=\"3\" class=\"thresholds_chart_viz-tooltip_date\"></td></tr><tr><td class=\"thresholds_chart_viz-tooltip_name\"></td><td class=\"thresholds_chart_viz-tooltip_sev\"></td><td class=\"thresholds_chart_viz-tooltip_value\"></td></tr></tbody></table></div>").appendTo(viz.$container_wrap);
                var tooltip_date = tooltip.find(".thresholds_chart_viz-tooltip_date");
                var tooltip_name = tooltip.find(".thresholds_chart_viz-tooltip_name");
                var tooltip_value = tooltip.find(".thresholds_chart_viz-tooltip_value");
                var tooltip_sev = tooltip.find(".thresholds_chart_viz-tooltip_sev");
                var tooltip_body = tooltip.find("tbody");

                // This allows to find the closest X index of the mouse:
                var bisect = d3.bisector(function(d) { return d.x; }).left;

                // Create a rect on top of the svg area: this rectangle recovers mouse position
                var overlay_rect = viz.svg.append('rect')
                    .attr("class","thresholds_chart_viz-tt_overlay")
                    .style("fill", "none")
                    .style("pointer-events", "all")
                    .attr('width', viz.width)
                    .attr('height', viz.height);

                // Create the circle that travels along the curve of chart
                var focus = viz.svg
                    //.append('g')
                    .append('circle')
                    .attr("class","thresholds_chart_viz-tt_focus_ring")
                    .style("pointer-events", "none")
                    .style("fill", "none")
                    .attr("stroke", viz.config.line_color)
                    .attr("stroke-opacity", 0.3)
                    .attr("stroke-width", 3)
                    .attr('r', (4 + Number(viz.config.line_size)))
                    .style("opacity", 0);

                overlay_rect.on('mouseover', function() {
                    focus.style("opacity", 1);
                    tooltip.css("opacity", 1);
                })
                .on('mousemove', function() {
                    // recover coordinate we need
                    var x0 = viz.xScale.invert(d3.mouse(this)[0]);
                    var i = bisect(viz.line_data, x0, 1);
                    var selectedData = viz.line_data[i];
                    if (selectedData.y !== null ) {
                        focus.attr("cx", viz.xScale(selectedData.x)).attr("cy", viz.yScale(selectedData.y));
                        //  might not be date axis
                        if (field1 === "_time") {
                            tooltip_date.text((new Date(selectedData.x)).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short',  year: 'numeric', hour:"2-digit", minute:"2-digit", second:"2-digit" }));
                        } else {
                            tooltip_date.text(+selectedData.x);
                        }
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
                        var top = viz.yScale(selectedData.y);
                        var tt_height = (50 + (viz.thresholds[selectedData.row].sevs.length * 22));
                        //position the box about the middle, but limit when near top or bottom
                        tooltip.css("top", Math.min((viz.height - tt_height), Math.max(viz.margin.top + 2, top - (tt_height / 2))));
                        // show on the left or right of point depending on whcih side of the chart we are on
                        var left = viz.xScale(selectedData.x);
                        if (left < viz.width / 2){ 
                            tooltip.css({"left": left + 100, "right": ""});
                        } else {
                            tooltip.css({"left": "", "right": viz.width - left + 80});
                        }
                    }
                })
                .on('mouseout', function () {
                    // What happens when the mouse move -> show the annotations at the right positions.
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