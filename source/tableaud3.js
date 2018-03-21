var viz, sheet, table, markSelected = 0;
d3ColumnHeaders = ['Product Name', 'Sub-Category', 'Sales'];
            
// Method to load the Tableau viz
function initViz() {
        var containerDiv = document.getElementById("vizContainer"),
        url = "https://demoapac.tableau.com/t/Presales/views/Category/Dashboard1",
        options = {
            hideTabs: true,
            hideToolbar: true,
            onFirstInteractive: function () {
                getUnderlyingData();
                listenToMarksSelection();
            }
        };
    viz = new tableau.Viz(containerDiv, url, options);
}

// Event listener for category selection
function listenToMarksSelection() {
    viz.addEventListener(tableau.TableauEventName.MARKS_SELECTION, onMarksSelection);
}

// What happens when selecting a mark
function onMarksSelection(marksEvent) {
    return marksEvent.getMarksAsync().then(reportSelectedMarks);
}

function reportSelectedMarks(marks) {
    if (marks.length > 0) {
        markSelected = 1;
    }
    else {
        markSelected = 0;
    }
    getUnderlyingData ();
}

// Get the underlying data from the sheet
function getUnderlyingData(){
    sheet = viz.getWorkbook().getActiveSheet().getWorksheets().get('Category Breakdown');
    options = {
        maxRows:0,
        ignoreAliases: false,
        ignoreSelection: false,
        includeAllColumns: true   
    };

    sheet.getUnderlyingDataAsync(options).then(function(t){
        table = t;
        var previousValue = "";
        var previousValueIndex = -2;
        var columnIndex = [];
        var data = table.getData(); // Get data
        var columnHeaders = table.getColumns(); // Get column headers
        
        // Retrieve the index of the column headers
        for (i=0; i<columnHeaders.length; i++)
        {
            for (k=0; k<d3ColumnHeaders.length; k++) {
                if (columnHeaders[i].$impl.$fieldName === d3ColumnHeaders[k]) {
                    columnIndex.push (i);
                    break;
                }
            }
        }
           
        // Getting data from the required columns as a JSON for each row     
        dataJson = [];                  
        for (i = 0; i < data.length; i++)
        {
            row = data [i];
            var jsonObj = {};
            for (k=0; k<columnIndex.length; k++)
            {
                header = d3ColumnHeaders[k];                            
                datapoint = row[columnIndex[k]].formattedValue;                            
                if (d3ColumnHeaders[k]=="Sales"){
                    datapoint = parseFloat(datapoint.replace(',', ''));                                
                }
                jsonObj [header] = datapoint;                                                   
            }                       
            dataJson.push (jsonObj);
        }
        
        // Performing a Group-By to aggregate and sum the data for each product
        var dataJsonAggregated = dataJson.reduce(function(res, obj) {
            if (!(obj['Product Name'] in res))
                res.__array.push(res[obj['Product Name']] = obj);
            else {
                res[obj['Product Name']].Sales += obj.Sales;
            }
            return res;
        }, {__array:[]}).__array.sort(function(a,b) { return b.Sales - a.Sales; });;

        // Transform the data into the JSON structure needed for Sunburst
        var newData = { name :"root", children : [] }, levels = ["Sub-Category"];
        dataJsonAggregated.forEach(function(d){
            var depthCursor = newData.children;
            levels.forEach(function( property, depth ){
                var index;
                depthCursor.forEach(function(child,i){
                    if ( d[property] == child.name ) index = i;
                });
                if ( isNaN(index) ) {
                    depthCursor.push({ name : d[property], children : []});
                    index = depthCursor.length - 1;
                }
                depthCursor = depthCursor[index].children;
                if ( depth === levels.length - 1 ) depthCursor.push({ name : d['Product Name'], size : d.Sales });
            });
        });

        var sortedArray = newData.children;
        sortedArray.sort(function(a,b) {
            sumA = 0;
            sumB = 0;
            for (i=0; i<a.children.length; i++) {
                sumA = sumA + a.children[i].size;
            }
            for (i=0; i<b.children.length; i++) {
                sumB = sumB + b.children[i].size;
            }
            return sumB - sumA;
         });
        newData.children = sortedArray;
            
        // Removing the previous sunburst, if it exists
        if (document.getElementById("d3viz")) {
            var element = document.getElementById("d3viz");
            element.parentNode.removeChild(element);
            }
        
        // Creating svg dimensions
        var width = document.getElementById('d3Container').clientWidth,
            height = document.getElementById('d3Container').clientHeight,
            radius = Math.min(width, height) / 2.2,
            color;
        
        // Defining Tableau color palettes
        function colors20 (n) {
          var colors = ["#4e79a7", "#a0cbe8", "#f28e2b", "#ffbe7d", "#59a14f", "#8cd17d", "#b6992d", "#f1ce63", "#499894", "#86bcb6", "#e15759", "#79706e", "#bab0ac", "#d37295", "#b07aa1", "#d4a6c8", "#9d7660", "#d7b5a6"];
          return colors[n];
        }

        function colors10 (n) {
          var colors = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f", "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac"];
          return colors[n];
        }

        // Creating the svg for the sunburst
        var svg = d3.select("#d3Container")
            .append("svg")
            .attr ("id", "d3viz")
            .attr("width", width)
            .attr("height", height)
            .append("g")
            .attr("transform", "translate(" + width / 2 + "," + height * .52 + ")");

        // Adding tooltip
        var tooltip = d3.select('#d3Container')
            .append("div")
            .attr("class", "tooltip")
            .style("position", "absolute")
            .style("z-index", "10")
            .style("opacity", 0);   

        // Tooltip functionality
        function mouseOverArc(d) {
            d3.select(this).attr("stroke","black")               
            tooltip.html(d.name + "<br> $" + d.value.toFixed(2));
            return tooltip.transition().duration(50).style("opacity", 0.9);
        }

        // Tooltip functionality
        function mouseOutArc(){
            d3.select(this).attr("stroke","")
            return tooltip.transition().duration(50).style("opacity", 0);
        }

        // Tooltip functionality
        function mouseMoveArc (d) {
            return tooltip.style("top", (d3.event.pageY-10)+"px").style("left", (d3.event.pageX+10)+"px");
        }

        // Creating the partitions in the sunburst
        var partition = d3.layout.partition()
            .sort(null)
            .size([2 * Math.PI, radius * radius])
            .value(function(d) { return d.size; });

        // Creating the angles
        var arc = d3.svg.arc()
            .startAngle(function(d) { return d.x; })
            .endAngle(function(d) { return d.x + d.dx; })
            .innerRadius(function(d) { return Math.sqrt(d.y); })
            .outerRadius(function(d) { return Math.sqrt(d.y + d.dy); });

        // Coloring the divisions
        var path = svg.selectAll("path")
            .data(partition.nodes(newData))
            .enter().append("path")
            .attr("display", function(d) { return d.depth ? null : "none"; }) // hide inner ring
            .attr("d", arc)
            .style("stroke", "#fff")
            .style("fill", function(d) { 
                // Determining which color palette to assign, to match Tableau's palette
                var color;
                if (markSelected == 0) {
                    if (previousValue != (d.children ? d : d.parent).name) {
                        previousValue = (d.children ? d : d.parent).name;
                        previousValueIndex += 1;
                    }
                    color = colors20 (previousValueIndex);
                }
                else {
                    if (previousValue != (d.children ? d : d.parent).name) {
                        previousValue = (d.children ? d : d.parent).name;
                        previousValueIndex += 1;
                    }
                    color = colors10 (previousValueIndex);
                }
                return color;
            })
                
            .style("fill-rule", "evenodd")
            .on("mouseover", mouseOverArc)
            .on("mousemove", mouseMoveArc)
            .on("mouseout", mouseOutArc);

        d3.select(self.frameElement).style("height", height + "px");   
    });
}                     