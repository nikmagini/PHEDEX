/**
* The class is used to create the block location module to view block information given the block name.
* The block information is obtained from Phedex database using web APIs provided by Phedex and is formatted to 
* show it to user in a YUI datatable.
* @namespace PHEDEX.Module
* @class BlockLocation
* @constructor
* @param sandbox {PHEDEX.Sandbox} reference to a PhEDEx sandbox object
* @param string {string} a string to use as the base-name of the <strong>Id</strong> for this module
*/
PHEDEX.namespace('Module');
PHEDEX.Module.BlockLocation = function(sandbox, string) {
    YAHOO.lang.augmentObject(this, new PHEDEX.Module(sandbox, string));

    var _sbx = sandbox;
    log('Module: creating a genuine "' + string + '"', 'info', string);

    var _totalRow = {};            //The first row JSON object that has the values
    var _lowpercent = 0;           //The lower percentage range of the data transfer
    var _highpercent = 100;        //The higher percentage range of the data transfer
    var _nPgBarIndex = 0;          //The unique ID for the progress bar
    var _nOrigLowPercent = 0;      //The original low percent to avoid re-formatting the result
    var _nOrigHighPercent = 0;     //The original max percent to avoid re-formatting the result
    var _strOrigBlkQuery = "";     //The original input block names of the query to avoid re-formatting the result
    var _strOrigNodeQuery = "";    //The original input node names of the query to avoid re-formatting the result
    var _bFormTable = false;       //The boolean indicated if table has to be formed again or not
    var _recordAllRow = null;      //The first row (Total row) object of the datatable
    var _regexpDot = null;         //The Regular expression object
    var _arrBlocks = null;         //The associative array stores all the blocks
    var _sliderRange = null;       //The object of the slider for percentage range of the data transfer
    var _arrColumns = null;        //The map that stores current column names
    var _arrColumnNode = null;     //The map that stores all the node (column) names
    var _arrQueryBlkNames = null;  //The input query block names
    var _divInput, _divResult, _divMissingBlks, _dataTable; //The input, result, info HTML elements

    /**
    * This function resets the "Result" elements in the web page for new search.
    * @method _clearResult
    * @private
    */
    var _clearResult = function() {
        _divResult.innerHTML = "";      //Reset the result element
        _divMissingBlks.innerHTML = ""; //Reset the missing blocks element
    }

    /**
    * This gets the actual data transfer percentage value from the slider range value which is in pixels.
    * @method _convertSliderVal
    * @param value {object} is actual slider value in pixels that has to be calibrated in range 0-100 %.
    * @private
    */
    var _convertSliderVal = function(value) {
        var temp = 100 / (200 - 20);
        return Math.round(value * temp); //Convert the min and max values of slider into percentage range
    }

    /**
    * This function resets all elements in the web page for new search.
    * @method _initializeValues
    * @private
    */
    var _initializeValues = function() {
        _clearResult();
        _nOrigLowPercent = 0;    //Reset the original low percent
        _nOrigHighPercent = 0;   //Reset the original high percent
        _strOrigBlkQuery = "";   //Reset the original block name query
        _strOrigNodeQuery = "";  //Reset the original node filter query
        _sliderRange.setValues(0, 200);  //Reset the values of the percentage range in pixels
        _divInput.txtboxBlk.value = "";  //Reset the block name text box
        _divInput.txtboxNode.value = ""; //Reset the node name text box
        _divInput.txtRange.innerHTML = _convertSliderVal(_sliderRange.minVal) + " - " + _convertSliderVal(_sliderRange.maxVal - 20) + " %";
    }

    /**
    * This updates the data transfer percentage range values as user moves the slider.
    * @method _updateRange
    * @private
    */
    var _updateRange = function() {
        //Set the values of the percentage range
        _divInput.txtRange.innerHTML = _convertSliderVal(_sliderRange.minVal) + " - " + _convertSliderVal(_sliderRange.maxVal - 20) + " %";
    }

    /**
    * This function creates and returns node object that stores the node information (name, 
    * current size that has been transferred so far and percent of transfer completed).
    * @method _newNode
    * @param name {String} is node name.
    * @param currentsize {Integer} is current size that has been transferred to node.
    * @param completepercent {Integer} is percentage of block that has been transferred.
    * @private
    */
    var _newNode = function(name, currentsize, completepercent) {
        var objNode = new Object(); //create new node object
        objNode.NodeName = name;
        objNode.CurrentSize = currentsize;
        objNode.CompletePercent = completepercent;
        return objNode; //return the node object
    }

    /**
    * The associative array the block name as key and block info ( block name, size, file count, list of 
    * nodes) as its value. This function adds node info to the associative array for the input block name.
    * @method _addBlockNode
    * @param strBlockName {String} is block name.
    * @param nTotalSize {Integer} is actual size of block that has to be transferred to node.
    * @param nTotalFiles {Integer} is number of files in the block that has to be transferred.
    * @param objNode {Object} is object that has information of node .
    * @private
    */
    var _addBlockNode = function(strBlockName, nTotalSize, nTotalFiles, objNode) {
        var arrNodes = null;
        var objBlock = _arrBlocks[strBlockName];
        if (objBlock == null) {
            objBlock = new Object(); //create new node object and assign the arguments to the properties of object
            objBlock.BlockName = strBlockName;
            objBlock.TotalSize = nTotalSize;
            objBlock.TotalFiles = nTotalFiles;
            objBlock.MinPercent = objNode.CompletePercent;
            objBlock.MaxPercent = objNode.CompletePercent;
            arrNodes = new Array();
            arrNodes[objNode.NodeName] = objNode;
            objBlock.Nodes = arrNodes;
            _arrBlocks[strBlockName] = objBlock;
        }
        else {
            arrNodes = objBlock.Nodes;
            arrNodes[objNode.NodeName] = objNode;
            if (objNode.CompletePercent > objBlock.MaxPercent) {
                objBlock.MaxPercent = objNode.CompletePercent; //Update the maximum percentage
            }
            else if (objNode.CompletePercent < objBlock.MinPercent) {
                objBlock.MinPercent = objNode.CompletePercent; //Update the minimum percentage
            }
        }
    }

    /**
    * This function gets the block information from Phedex database using web APIs provided by Phedex given 
    * the block names in regular expression format.
    * The result is formatted and is shown to user in YUI datatable.
    * @method _getDataInfo
    * @private
    */
    var _getDataInfo = function() {
        var strDataInput = _divInput.txtboxBlk.value;
        strDataInput = strDataInput.trim(); //Remove the whitespaces from the ends of the string
        if (!strDataInput) {
            alert("Please enter the query block name(s)."); //Alert user if input is missing
            _clearResult();
            return;
        }
        _lowpercent = _convertSliderVal(_sliderRange.minVal);
        _highpercent = _convertSliderVal(_sliderRange.maxVal - 20);

        _divInput.btnGetInfo.disabled = true; //Disable the Get Info button
        _divInput.btnReset.disabled = true;   //Disable the Reset button

        strDataInput = strDataInput.replace(/\n/g, " ");
        var blocknames = strDataInput.split(/\s+/); //Split the blocks names using the delimiter whitespace (" ")
        var indx = 0;
        _arrQueryBlkNames = new Array();
        for (indx = 0; indx < blocknames.length; indx++) {
            blocknames[indx] = blocknames[indx].trim(); //Remove the whitespaces in the blocknames
            _insertData(_arrQueryBlkNames, blocknames[indx], "");
        }
        var strNodeInput = _divInput.txtboxNode.value;
        if (_strOrigBlkQuery == strDataInput) //Check if current query block names and previous query block names are same or not
        {
            //No change in the input query. So, no need make data service call
            if (!(_strOrigNodeQuery == strNodeInput)) {
                _arrColumns = _filterNodes(); //Filter the nodes as entered by user
                _divMissingBlks.innerHTML = "Please wait... the query is being processed..."; //Show user the status message
                _formatResult(_arrColumns); //Do UI updates - show the block info to user in YUI datatable.
            }
            else if (!((_nOrigHighPercent == _highpercent) && (_nOrigLowPercent == _lowpercent))) //Check if there is any change in the percentage range
            {
                _divMissingBlks.innerHTML = "Please wait... the query is being processed..."; //Show user the status message
                _formatResult(_arrColumns); //Do UI updates - show the block info to user in YUI datatable.
                _nOrigLowPercent = _lowpercent;
                _nOrigHighPercent = _highpercent;
            }
            _strOrigNodeQuery = strNodeInput;
            _divInput.btnGetInfo.disabled = false; //Enable the Get Info button
            _divInput.btnReset.disabled = false;   //Enable the Reset button
            return;
        }

        _divResult.innerHTML = "";
        _divMissingBlks.innerHTML = "Please wait... the query is being processed..."; //Show user the status message
        //Store the value for future use to check if value has changed or not and then format the result
        _nOrigLowPercent = _lowpercent;
        _nOrigHighPercent = _highpercent;
        _strOrigBlkQuery = strDataInput;
        _strOrigNodeQuery = strNodeInput;

        //Callback function used by YUI connection manager on completing the connection request with web API
        var funcSuccess = function(jsonBlkData) {
            try {
                var blk = null, replica = null;
                var indxBlock = 0, indxReplica = 0, indxNode = 0;
                var blockbytes = 0, blockcount = 0, blockfiles = 0, replicabytes = 0, replicacount = 0;
                if (_arrBlocks) {
                    _arrBlocks = null;
                }
                _arrBlocks = new Array(); //Create new associative array to store all the block info

                if (_arrColumnNode) {
                    _arrColumnNode = null;
                }
                _arrColumnNode = new Array(); //Create new associative array to store all the node names

                blockcount = jsonBlkData.block.length; //Get the block count from json response
                //Traverse through the blocks in json response to get block information
                for (indxBlock = 0; indxBlock < blockcount; indxBlock++) {
                    blk = null;
                    blk = jsonBlkData.block[indxBlock]; //Get the block object from the json response
                    if (blk) {
                        blockbytes = blk.bytes / 1; //Get bytes count that has to be transferred
                        blockfiles = blk.files / 1; //Get number of files of the block

                        replicacount = blk.replica.length;  //Get the count of replicas (nodes) to whom the block is being transferred
                        //Traverse through the replicas (nodes) for each block to get node information
                        for (indxReplica = 0; indxReplica < replicacount; indxReplica++) {
                            replica = null;
                            replica = blk.replica[indxReplica]; //Get the replica (node) object from the json response
                            if (replica) {
                                replicabytes = replica.bytes / 1; //Get the bytes count that was transferred
                                var percentcompleted = 100 * replicabytes / blockbytes; //Calculate the data transfer percenatage
                                if (_isDecimal(percentcompleted)) {
                                    percentcompleted = percentcompleted.toFixed(2); //Round off the percentage to 2 decimal digits
                                }
                                var objNode = _newNode(replica.node, replicabytes, percentcompleted); //Create new node object to add to hash table
                                _addBlockNode(blk.name, blockbytes, blockfiles, objNode);  //Add the block and its new node info to the hash map
                                _insertData(_arrColumnNode, replica.node, "");  //Add the node name to the hash map
                            }
                        }
                    }
                }

                if (blockcount == 0) // Check if there is any block information to show to user
                {
                    //No blocks are found for the given input
                    if (_arrayLength(_arrQueryBlkNames) > 0) {
                        var strXmlMsg = _getMissingBlocks(); //Get the block names for which data service returned nothing and show to user
                        _divResult.innerHTML = ""; //Reset the result
                        _divMissingBlks.innerHTML = strXmlMsg; //Show the result to user
                    }
                }
                else {
                    //Do UI updates - show the block info to user
                    _arrColumns = _filterNodes(); //Filter the results using the node filter
                    if (_arrayLength(_arrColumns) > 0) {
                        _formatResult(_arrColumns);
                    }
                    else {
                        _bFormTable = true;
                        var strXmlMsg = _getMissingBlocks(); //Get the block names for which data service returned nothing and show to user
                        _divMissingBlks.innerHTML = strXmlMsg;
                    }
                }
            }
            catch (e) {
                alert("Error in processing the received response. Please check the input.");
                _clearResult();
                _bFormTable = true;
            }
            _divInput.btnGetInfo.disabled = false; //Enable the Get Info button
            _divInput.btnReset.disabled = false;   //Enable the Reset button
            return;
        }

        //If YUI connection manager fails communicating with web API, then this callback function is called
        var funcFailure = function(objError) {
            alert("Error in communicating with Phedex and receiving the response. " + objError.message);
            _clearResult(); //Clear the result elements
            _bFormTable = true;
            _divInput.btnGetInfo.disabled = false; //Enable the Get Info button
            _divInput.btnReset.disabled = false;   //Enable the Reset button
            return;
        }

        var eventSuccess = new YAHOO.util.CustomEvent("event success");
        var eventFailure = new YAHOO.util.CustomEvent("event failure");

        eventSuccess.subscribe(function(type, args) { funcSuccess(args[0]); });
        eventFailure.subscribe(function(type, args) { funcFailure(args[0]); });

        PHEDEX.Datasvc.Call({ api: 'blockreplicas', args: { block: blocknames }, success_event: eventSuccess, failure_event: eventFailure });
    }

    /**
    * This builds the input component of the module by adding the required form controls for input.
    * @method _buildInput
    * @param domInput {HTML Element} is HTML element where the input component of the module is built.
    * @private
    */
    var _buildInput = function(domInput) {
        var TxtBoxBlk = document.createElement('textarea');
        TxtBoxBlk.className = 'txtboxBlkNode';
        TxtBoxBlk.rows = 4;
        TxtBoxBlk.cols = 40;

        var TxtBoxNode = document.createElement('textarea');
        TxtBoxNode.className = 'txtboxBlkNode';
        TxtBoxNode.rows = 4;
        TxtBoxNode.cols = 40;

        var tableInput = document.createElement('table');
        tableInput.border = 0;
        tableInput.cellspacing = 3;
        tableInput.cellpadding = 3;
        var tableRow = tableInput.insertRow(0);

        var tableCell1 = tableRow.insertCell(0);
        var tableCell2 = tableRow.insertCell(1);
        tableCell1.innerHTML = '<div>Enter data block(s) name (separated by whitespace):</div>';
        tableCell1.appendChild(TxtBoxBlk);
        tableCell2.innerHTML = '<div>Enter node(s) name (separated by whitespace):</div>';
        tableCell2.appendChild(TxtBoxNode);

        domInput.txtboxBlk = TxtBoxBlk;
        domInput.txtboxNode = TxtBoxNode;
        domInput.appendChild(tableInput);

        var tableSlider = document.createElement('table');
        tableSlider.border = 0;
        tableSlider.cellspacing = 3;
        tableSlider.className = 'yui-skin-sam';
        tableRow = tableSlider.insertRow(0);

        tableCell1 = tableRow.insertCell(0);
        tableCell2 = tableRow.insertCell(1);
        var tableCell3 = tableRow.insertCell(2);

        tableCell1.innerHTML = '<span>Select data transfer percentage range:</span>&nbsp;&nbsp;';
        var divSliderRange = document.createElement('div');
        divSliderRange.className = 'yui-h-slider';
        divSliderRange.title = 'Move the slider to select the range';

        var divSliderLower = document.createElement('div');
        divSliderLower.className = 'yui-slider-thumb';
        divSliderLower.innerHTML = '<img src="/images/left-thumb.png"/>';
        var divSliderHigher = document.createElement('div');
        divSliderHigher.className = 'yui-slider-thumb';
        divSliderHigher.innerHTML = '<img src="/images/right-thumb.png"/>';
        divSliderRange.appendChild(divSliderLower);
        divSliderRange.appendChild(divSliderHigher);
        tableCell2.appendChild(divSliderRange);

        domInput.divSliderRange = divSliderRange;
        domInput.divSliderLower = divSliderLower;
        domInput.divSliderHigher = divSliderHigher;

        var TxtRange = document.createElement('span');
        TxtRange.innerHTML = '0 - 100';
        tableCell3.appendChild(TxtRange);
        domInput.txtRange = TxtRange;
        domInput.appendChild(tableSlider);

        var range = 200;          // The range of slider in pixels
        var tickSize = 0;         // This is the pixels count by which the slider moves in fixed pixel increments
        var minThumbDistance = 0; // The minimum distance the thumbs can be from one another
        var initValues = [0, 200]; // Initial values for the Slider in pixels

        // Create the Yahoo! DualSlider
        _sliderRange = YAHOO.widget.Slider.getHorizDualSlider(divSliderRange, divSliderLower, divSliderHigher, range, tickSize, initValues);
        _sliderRange.minRange = minThumbDistance;
        _sliderRange.subscribe('ready', _updateRange);  //Adding the function to ready event
        _sliderRange.subscribe('change', _updateRange); //Adding the function to change event
        domInput.appendChild(tableSlider);

        var btnGetInfo = document.createElement('span');
        var btnReset = document.createElement('span');
        btnGetInfo.className = 'yui-skin-sam';
        btnReset.className = 'yui-skin-sam';
        domInput.btnGetInfo = btnGetInfo;
        domInput.btnReset = btnReset;
        domInput.appendChild(btnGetInfo);
        domInput.appendChild(btnReset);

        // Create Yahoo! Buttons
        var objPushBtnGet = new YAHOO.widget.Button({ label: "Get Block Data Info", id: "datalookup-btnGetInfo", container: btnGetInfo, onclick: { fn: _getDataInfo} });
        var objPushBtnReset = new YAHOO.widget.Button({ label: "Reset", id: "datalookup-btnReset", container: btnReset, onclick: { fn: _initializeValues} });
    }

    /**
    * This builds the module by adding the required form controls for input and output.
    * @method _buildModule
    * @param domModule {HTML Element} is HTML element where the module has to be built.
    * @private
    */
    var _buildModule = function(domModule) {
        domModule.content.divInput = document.createElement('div');
        domModule.content.divInput.style.backgroundColor = 'white';
        _divInput = domModule.content.divInput;
        domModule.content.appendChild(_divInput);
        _buildInput(_divInput);

        domModule.content.divResult = document.createElement('div');
        _divResult = domModule.content.divResult;
        domModule.content.appendChild(_divResult);
        
        domModule.content.divMissingBlks = document.createElement('div');
        _divMissingBlks = domModule.content.divMissingBlks;
        domModule.content.appendChild(domModule.content.divMissingBlks);

        var cntrlInput = new PHEDEX.Component.Control(PxS, {
            payload: {
                text: 'Show Input',
                title: 'This shows the input component.',
                target: _divInput,
                animate: true,
                className: 'float-right phedex-core-control-widget phedex-core-control-widget-inactive'
            }
        });

        domModule.title.appendChild(cntrlInput.el);
        cntrlInput.Show();

        var strDot = ".";
        _regexpDot = new RegExp(strDot);
        _initializeValues();
    }

    /**
    * This adds\updates "Total Row" values in associative array i.e total values of all columns.
    * @method _updateTotalRow
    * @param arrTotal {Array} is associative array that has total of all column values.
    * @param strColumnName {String} is column name.
    * @param nValue {String} is column value.
    * @private
    */
    var _updateTotalRow = function(arrTotal, strColumnName, nValue) {
        var nVal = arrTotal[strColumnName]; //Get the value for the table column
        if (nVal) {
            arrTotal[strColumnName] = nVal + nValue; //Update the total value
        }
        else {
            arrTotal[strColumnName] = nValue //Add the total value 
        }
    }

    /**
    * This checks if the node column has to be shown in the datatable or not by checking the data transfer 
    * percentage of all blocks of that node
    * @method _showNode
    * @param strColumnName {String} is column name.
    * @private
    */
    var _showNode = function(strColumnName) {
        var nTransferPercent = 0, indx = 0, nLength = 0;
        var recsetNode = _dataTable.getRecordSet(); //Get the values of the column
        nLength = recsetNode.getLength();
        for (indx = 1; indx < nLength; indx++) {
            var recBlock = recsetNode.getRecord(indx);
            nTransferPercent = recBlock.getData(strColumnName);
            if ((nTransferPercent >= _lowpercent) && (nTransferPercent <= _highpercent)) //Check if percentage is within query range
            {
                return true;  //Show this node to user
            }
        }
        return false; //Do not show this node to user
    }

    /**
    * This gets the list of nodes that match with the given separate expression of the node filter.
    * @method _getQueryColumns
    * @param strQuery {String} is regular expression query.
    * @private
    */
    var _getQueryColumns = function(strQuery) {
        var bShow = false, strColumnName = "";
        var arrQueryCols = new Array(); //Create new associative array to store node column names
        for (strColumnName in _arrColumnNode) {
            var regexpNodes = new RegExp(strQuery);       //Form the regular expression object
            var bExist = regexpNodes.test(strColumnName); //Check if this node matched with the given expression of input node filter
            if (bExist) {
                //Show the node column
                _insertData(arrQueryCols, strColumnName, "");
            }
        }
        return arrQueryCols; //Return the set that has the column names for the input node filter expression
    }

    /**
    * This filters the result based on the input node filter. Only nodes matching the filter 
    * (separate expressions are ANDed) will be shown as columns in the table.
    * @method _filterNodes
    * @private
    */
    var _filterNodes = function() {
        var indx = 0;
        var strColumnName = "", strName = "";
        var strNodeNames = _divInput.txtboxNode.value; //Get the node filter
        strNodeNames = strNodeNames.trim(); //Remove the whitespaces from the ends of the string
        if (strNodeNames.length == 0) //If node query box is empty, then show all columns
        {
            return _arrColumnNode;
        }

        strNodeNames = strNodeNames.replace(/\n/g, " ");
        var arrNodeNames = strNodeNames.split(/\s+/); //Split the blocks names using the delimiter whitespace (" ")
        var arrQueryNodes = new Array();
        for (indx = 0; indx < arrNodeNames.length; indx++) {
            strName = arrNodeNames[indx].trim(); //Remove the whitespaces in the blocknames
            _insertData(arrQueryNodes, strName, "");
        }

        var nLoop = 0;
        var arrNodeCols = null, arrQueryCols = null;
        var arrTemp = new Array();
        for (strName in arrQueryNodes) {
            arrQueryCols = _getQueryColumns(strName); //Get the list of nodes that match with the given separate expression of the node filter 
            if (nLoop == 0) //If first loop, then just copy the result of query to the result column list
            {
                arrNodeCols = arrQueryCols;
                nLoop++;
            }
            else {
                //Find the intersection of query result and seperate expression result
                arrTemp = new Array();
                for (strColumnName in arrQueryCols) {
                    var obj = arrNodeCols[strColumnName];
                    if (obj == "") {
                        _insertData(arrTemp, strColumnName, ""); //Add if both sets have same item
                    }
                }
                arrNodeCols = null;   //Clear the previous result
                arrNodeCols = arrTemp; //The query result is updated with the new value
            }
        }
        return arrNodeCols; //Return the set of nodes to be shown to user
    }

    /**
    * This hides the column in the datatable of the module.
    * @method _hideColumn
    * @param strColumnName {String} is column name.
    * @private
    */
    var _hideColumn = function(strColumnName) {
        var objColumn = _dataTable.getColumn(strColumnName); //Get the column object
        if (objColumn) {
            _dataTable._hideColumn(objColumn); //Hide the column
        }
    }

    /**
    * This shows the column in the datatable of the module.
    * @method _showColumn
    * @param strColumnName {String} is column name.
    * @private
    */
    var _showColumn = function(strColumnName) {
        var objColumn = _dataTable.getColumn(strColumnName); //Get the column object
        if (objColumn) {
            _dataTable._showColumn(objColumn); //Show the column
        }
    }

    /**
    * This checks if the block row has to be shown in the datatable or not by checking the data
    * transfer percentage of all block nodes.
    * @method _showBlock
    * @param objBlock {Object} is block object that has block details.
    * @param arrColumn {Array} has column names.
    * @private
    */
    var _showBlock = function(objBlock, arrColumn) {
        var strColumnName = "";
        var jsonNode = null, objNode = null;
        var nTransferPercent = 0, nNodeCount = 0;
        var arrBlkNodes = objBlock.Nodes;
        if (arrBlkNodes) {
            nNodeCount = _arrayLength(arrBlkNodes);
            if (nNodeCount < _arrayLength(_arrColumnNode)) {
                objBlock.MinPercent = 0;
            }
            if (!((_highpercent < objBlock.MinPercent) || (objBlock.MaxPercent < _lowpercent))) {
                for (strColumnName in arrColumn) {
                    objNode = arrBlkNodes[strColumnName]; //Get the block info for the given block name
                    if (objNode) {
                        nTransferPercent = objNode.CompletePercent;
                    }
                    else {
                        nTransferPercent = 0;
                    }
                    if ((nTransferPercent >= _lowpercent) && (nTransferPercent <= _highpercent)) //Check if percentage is within query range
                    {
                        return true; //Show this block to user
                    }
                }
            }
        }
        return false; //Do not show this block to user
    }

    /**
    * This function formats the result obtained from data service, applies filter if any and shows the result in  
    * YUI datatable.
    * @method _formatResult
    * @param arrColumn {Array} has column names that has to be shown on UI. The columns vary depending on input filter.
    * @private
    */
    var _formatResult = function(arrColumn) {
        var data = [];
        var bShow = false;
        var strBlockName = "", strColumnName = "";
        var nCurrentSize = 0, nTransferPercent = 0, nCount = 0;
        var objArr = null, objBlock = null, objNode = null, arrBlkNodes = null;
        var arrTotal = new Array(); //Create new associate array to store all the total row

        _nPgBarIndex = 0; //Reset the ID of the progress bar    
        for (objArr in _arrBlocks) {
            objBlock = _arrBlocks[objArr];
            if (objBlock == null) {
                continue;
            }
            bShow = _showBlock(objBlock, arrColumn); //Check if the block can be shown to user
            if (bShow) {
                nCount++;
                arrBlkNodes = objBlock.Nodes;
                //The block has percentage range within user input query range. So show this block to user
                strBlockName = objBlock.BlockName; //Get the block name
                var row = { "blockname": strBlockName, "blockfiles": objBlock.TotalFiles, "blockbytes": objBlock.TotalSize };
                for (strColumnName in arrColumn) {
                    arrBlkNodes = objBlock.Nodes;
                    objNode = arrBlkNodes[strColumnName]; //Get the node info for the given node name
                    if (objNode) {
                        nTransferPercent = objNode.CompletePercent;
                        _updateTotalRow(arrTotal, strColumnName, objNode.CurrentSize);
                    }
                    else {
                        nTransferPercent = 0;
                    }
                    row[strColumnName] = nTransferPercent;
                }
                //This checks the result obtained from data serice, input block names and shows user if input is invalid
                _queryBlockExists(strBlockName);

                data.push(row);
                _updateTotalRow(arrTotal, "blockfiles", objBlock.TotalFiles); //Update the values of Total Row for the datatable
                _updateTotalRow(arrTotal, "blockbytes", objBlock.TotalSize); //Update the values of Total Row for the datatable
            }
        }

        //The custom progress bar format to the node column
        var formatProgressBar = function(elCell, oRecord, oColumn, sData) {
            var nSize = oRecord.getData("blockbytes") * sData / 100; //Calculate the current size of the block data transferred
            var strHTML = '<div><div id = "BlkProgressBar' + ++_nPgBarIndex + '" role="progressbar" aria-valuemin="0" aria-valuemax=100" aria-valuenow="' + sData + '" ';
            var strPerHTML = '';
            if ((sData >= _lowpercent) && (sData <= _highpercent)) {
                //The percentage is within query range
                strHTML = strHTML + 'class="progressbar ui-progressbar ui-widget ui-widget-content ui-corner-all" aria-disabled="true">';
                strPerHTML = '<div class = "percent">' + sData + '% (' + PHEDEX.Util.format.bytes(nSize) + ')</div>';
            }
            else {
                //The percentage is NOT within query range. So disable the progress bar
                strHTML = strHTML + 'class="progressbar ui-progressbar ui-widget ui-widget-content ui-corner-all ui-progressbar-disabled ui-state-disabled">';
                strPerHTML = '<div class = "disablepercent">' + sData + '% (' + PHEDEX.Util.format.bytes(nSize) + ')</div>';
            }
            strHTML = strHTML + '<div class="ui-progressbar-value ui-widget-header ui-corner-left" style="width:' + sData + '%;"></div></div>'
            strHTML = '<div>' + strHTML + strPerHTML + '</div>';
            elCell.innerHTML = strHTML;
        };

        YAHOO.widget.DataTable.Formatter.customProgressBar = formatProgressBar; //Assign column format with the custom progress bar format

        var dtColumnsDef = [{ "key": "blockname", "label": "Block", "sortable": true, "resizeable": true, "width": 300 },
                            { "key": "blockfiles", "label": "Files", "sortable": true, "resizeable": true, "width": 30 },
                            { "key": "blockbytes", "label": "Size", "sortable": true, "resizeable": true, "width": 70, "formatter": "customBytes" }
                            ];
        var dsCols = ["blockname", "blockfiles", "blockbytes"];
        //Traverse through the node list and add node columns to the datasource
        for (strColumnName in arrColumn) {
            dtColumnsDef.push({ "key": strColumnName, "sortable": true, "formatter": "customProgressBar" });
            dsCols.push(strColumnName);
        }

        //The function that is called after any of the columns is sorted
        //This is used to put the "Total" row always at top of the table
        var AfterSorting = function(oArgs) {
            var nRowIndx = _dataTable.getRecordIndex(_recordAllRow);
            _dataTable.deleteRow(nRowIndx); 		    //Delete the Total row from its current position after sorting 
            _dataTable.addRow(_totalRow, 0); 		    //Add the Total row at top of the table
            _recordAllRow = _dataTable.getRecord(0); 	//Get the Total row object and store it for future use in this function.
        };

        try {
            if (_dataTable) {
                _dataTable.destroy();
                _dataTable = null;
                dataSource = null;
            }
            dataSource = new YAHOO.util.LocalDataSource(data); //Create new datasource
            dataSource.responseType = YAHOO.util.DataSource.TYPE_JSARRAY;
            dataSource.responseSchema = { "fields": dsCols };

            if (nCount > 70) //Use Paginator as there are more blocks to display
            {
                var pagnDtResult = { paginator: new YAHOO.widget.Paginator({ rowsPerPage: 50 }) }; //Paginator configuration to display large number of blocks
                _dataTable = new YAHOO.widget.DataTable(_divResult, dtColumnsDef, dataSource, pagnDtResult); //Create new datatable using datasource and column definitions
            }
            else {
                _dataTable = new YAHOO.widget.DataTable(_divResult, dtColumnsDef, dataSource); //Create new datatable using datasource and column definitions
            }
            _dataTable.subscribe('columnSortEvent', AfterSorting);  //Assign the function to the event (after column gets sorted)
        }
        catch (e) {
            alert("The following error occurred: " + e.name + " - " + e.message);
            //alert("Error in adding data to the table");
            return;
        }

        if (_dataTable.getRecordSet().getLength() > 0) {
            var nAllCurrentSize = 0, nValue = 0;
            var nAllBlockFiles = arrTotal["blockfiles"]; //Get the total block file count
            var nAllBlockBytes = arrTotal["blockbytes"]; //Get the total block size
            _totalRow = { "blockname": "(All)", "blockfiles": nAllBlockFiles, "blockbytes": nAllBlockBytes };
            for (strColumnName in arrColumn) {
                nValue = arrTotal[strColumnName]; //Get the node total info
                if (nValue) {
                    nAllCurrentSize = nValue;
                }
                else {
                    nAllCurrentSize = 0;
                }
                var percentcompleted = 100 * nAllCurrentSize / nAllBlockBytes; //Calculate the total data transfer percenatage for node
                if (_isDecimal(percentcompleted)) {
                    percentcompleted = percentcompleted.toFixed(2);
                }
                _totalRow[strColumnName] = percentcompleted;
            }
            arrTotal = null; //Clear the arrTotal

            try {
                _dataTable.addRow(_totalRow, 0);
                _recordAllRow = _dataTable.getRecord(0);
            }
            catch (ex) {
                alert("Error in adding total row to the table");
            }
            if (_arrayLength(arrColumn) < _arrayLength(_arrColumnNode)) //Node filter is on
            {
                //Now check if all visible blocks for the node columns have data transfer percentage range within query range 
                for (strColumnName in arrColumn) {
                    bShow = _showNode(strColumnName);
                    if (!bShow) {
                        //Hide the column as the column has all blocks data transfer percentage range out of query range
                        _hideColumn(strColumnName);
                    }
                }
            }
        }
        else {
            _divResult.innerHTML = "";
            _bFormTable = true;
        }
        if (_arrayLength(_arrQueryBlkNames) > 0) {
            var strXmlMsg = _getMissingBlocks(); //Get the block names for which data service returned nothing and show to user
            _divMissingBlks.innerHTML = strXmlMsg;
        }
        else {
            _divMissingBlks.innerHTML = ""; //Clear the user message
        }
    }

    /**
    * This function checks if the query block name is there in the result obtained from API or not.
    * @method _queryBlockExists
    * @param blockname {String} is name of block whose information would be checked if it matches input filter or not.
    * @private
    */
    var _queryBlockExists = function(blockname) {
        try {
            if (_arrayLength(_arrQueryBlkNames) == 0) {
                return;
            }
            var indx = 0, wildcharindx = 0;
            var queryblkname = "", strName = "";
            blockname = blockname.toLowerCase();
            //Traverse the set and check if the block is there or not
            for (strName in _arrQueryBlkNames) {
                queryblkname = strName.toLowerCase();
                wildcharindx = queryblkname.indexOf("*"); //If the input has wild character
                if (wildcharindx > -1) {
                    queryblkname = queryblkname.substring(0, wildcharindx);
                    if (blockname.startsWith(queryblkname)) {
                        delete _arrQueryBlkNames[strName];
                        break;
                    }
                }
                else if (blockname == queryblkname) {
                    delete _arrQueryBlkNames[strName]; //Remove the blockname from the set as it is there in the result
                    break;
                }
            }
        }
        catch (ex) {
        }
    }

    /**
    * This function generates the html element to show the missing blocks for which data service didn't return any info.
    * @method _getMissingBlocks
    * @private
    */
    var _getMissingBlocks = function() {
        var strName = "", indx = 1;
        var strXmlMsg = 'The query result for the following block(s) is none because [block name is wrong]\\[block data transfer percentage ';
        strXmlMsg = strXmlMsg + "is out of the input range]\\[any of the node names is wrong].<br/>";
        for (strName in _arrQueryBlkNames) {
            strXmlMsg = strXmlMsg + indx + ". " + strName + "<br/>";
            indx++;
        }
        return strXmlMsg;
    }

    /**
    * This gets the length of the associative array.
    * @method _arrayLength
    * @param array {Array} is array whose length has to be found.
    * @private
    */
    var _arrayLength = function(array) {
        var nLength = 0;
        for (var object in array) {
            nLength++;
        }
        return nLength;
    }

    /**
    * This function checks if input number is decimal or not. Used to display numbers with precison.
    * @method _isDecimal
    * @param value {String} would be checked if it has decimal values or not.
    * @private
    */
    var _isDecimal = function(value) {
        return _regexpDot.test(value);
    }

    /**
    * This inserts data to associative array if not present else leave it.
    * @method _insertData
    * @param array {Array} is associative array in which (key, value) pair has to be inserted.
    * @param strKey {String} is key.
    * @param strVal {String} is value.
    * @private
    */
    var _insertData = function(arrData, strKey, strVal) {
        var objVal = arrData[strKey]; //Get the value for the key
        if (objVal == null) {
            arrData[strKey] = strVal; //Add the value if key is not present
        }
    }

    //Used to construct the group usage widget.
    _construct = function() {
        return {
            /**
            * This inits the Phedex.BlockLocation module and notify to sandbox about its status.
            * @method initData
            */
            initData: function() {
                this.dom.title.innerHTML = 'Phedex Block Location';
                _buildModule(this.dom);
                _sbx.notify(this.id, 'initData');
                return;
            },
            /**
            * This gets the group information from Phedex data service for the given group name through sandbox.
            * @method getData
            */
            getData: function() {
                _sbx.notify(this.id, 'getData');
                return;
            },

            /**
            * This processes the group information obtained from data service and shows in YUI datatable.
            * @method gotData
            * @param data {object} group information in json format used to fill the datatable directly using a defined schema.
            */
            gotData: function(dataGroup) {
                _sbx.notify(this.id, 'gotData');
                return;
            }
        };
    };
    YAHOO.lang.augmentObject(this, _construct(), true);
    return this;
};

log('loaded...','info','groupusage');