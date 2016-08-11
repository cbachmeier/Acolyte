/*
	zenCSLM.js
	ZEN JavaScript client-side library module
	Copyright (c) 2008-2011 InterSystems Corp. ALL RIGHTS RESERVED.
        Local JS Namespace: ZLM
*/

var ZLM = {};

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//                     PPPP   AAA  RRRR  TTTTT    III                         //
//                     P   P A   A R   R   T       I                          //
//                     PPPP  AAAAA RRRR    T       I                          //
//                     P     A   A R   R   T       I                          //
//                     P     R   R R   R   T      III                         //
//                                                                            //
//                    Client-side layout manager stuff                        //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

//##########################//
//  GLOBAL DATA/PARAMETERS  //
//##########################//
ZLM.managers = [];      // list of all known low-level managers
ZLM.managedGroups = []; // list of all known groups requiring local management
ZLM.boundElements = []; // list of all known bound elements

//##################//
// INTERNAL CLASSES //
//##################//

//===============================================================================//
// ManagedArea                                                                   //
// From a page management standpoint a ManagedArea is just a div whose contents  //
// is subject to repositioning and resizing via a known Javascript source (the   //
// manager).  From an event management standpoint, there are some standard       //
// hooks to simplify the process of dragging, adding and removing items within   //
// the mananaged area.  Managers that do not require or support these features   //
// are free to leave the associated functions null.                              //
//===============================================================================//

// Create a new Managed Area object that puts the HTML Div "root" under the active
// control of the client-side layout manager "managerName"
ZLM.ManagedArea= function(managerName,root) {
	this.managerName = managerName;   // the semantic name of this layout manager
	this.root = root;                 // the node of the DOM tree under direct control of this manager
	this.rootId = root.id;
	this.nodeDepth = ZLM.getDepth(document.body,root);
	this.engine = null;

	// Functions that any functional manager should replace
	this.layoutBlock = null;    // function to actually lay out the contents of the block
	this.extractItem = null;    // function to remove an existing item from this block
	this.insertItem = null;     // function to insert a new item into this block
	this.startDrag = null;      // function to prepare for a drag operation
	this.endDrag = null;        // function to clean up after a drag operation
	this.constrainDragX = null; // function to limit x movement during a drag
	this.constrainDragY = null; // function to limit y movement during a drag
}

//=================================================================================//
// BoundElement                                                                    //
// Bound elements are absolutely positioned widgets whose size and position is     //
// dictated by that of an inline element.  When a new bound element is registered  //
// the CSLM, it becomes the responsability of the CSLM to enforce the given        //
// constraints for so long as the page is active.  If an exact overlay of an       //
// element is desired under FireFox or IE6+, bound elements are not required, the  //
// same effect can be achieved by nesting a relatively positioned div inside the   //
// inline div and giving the nested div a geometry of top:0 left:0 width:100%      //
// height:100%.  This is preferable in that it puts the geometry management burden //
// on the native browser code rather than interpreted JavaScript.  For mismatched  //
// geometries, certain other browsers, or situation where the required structure   //
// of the DOM precludes the direct nesting of the CSS solution, use bound elements //
//=================================================================================//

// Create a new Bound Element where a floating HTML Div "elementPtr" is bound to
// an inline HTML Div "inlineElementPtr" with fixed horizontal and vertical offsets
// "hOffset" and "vOffset" (respectively) and horizonatal and veritcal scaling factors
// of "hSize" and "vSize" (respectively)
ZLM.BoundElement =function(elementPtr, inlineElementPtr, hOffset, vOffset, hSize, vSize) {
	this.absE = elementPtr;        // the object to position/resize
	this.baseE = inlineElementPtr; // reference object
	this.hOffset=hOffset;          // (+/-) horizontal offset in pixels
	this.vOffset=vOffset;          // (+/-) vertical offset in pixels
	this.hSize=hSize;              // ratio of absE width to baseE width (or 0 if resizing disabled)
	this.vSize=vSize;              // ratio of absE height to baeE height (or 0 if resizing disabled)
	this.absE.style.position="absolute";
}

// Refresh the position (and possibly) size of the given element based on the current
// settings of the base element
ZLM.BoundElement.prototype.refresh = function () {
	var top =ZLM.getRelativeOffsetTop(this.baseE,this.absE.offsetParent)+this.vOffset;
	this.absE.style.top=top+"px";
	var left=ZLM.getRelativeOffsetLeft(this.baseE,this.absE.offsetParent)+this.hOffset;
	this.absE.style.left=left+"px";
}

//##########################//
// PART I LIBRARY FUNCTIONS //
//##########################//

///////////////////////////////////////
// PART I EVENT MANAGEMENT FUNCTIONS //
///////////////////////////////////////

ZLM.notifyTarget=null;  // trap to protect against IE 7 bug

/// Recurse through the DOM searching for any element node that have an
/// onresize event handler defined.  This is distinct from the HTML resize
/// event.  That event, by W3C standards, applies only to the window and does
/// not propagate through the DOM.  This system designed to all individual elements
/// to be notified of changes to the surrounding geometry and react accordingly.
/// Elements with a defined resize handler have the option of stopping the propagation
/// of the synthetic event to their children by returning a value of TRUE from the
/// resize handler routine (persumably this is done because the element in question
/// is taking direct responsibility for the geometry management of its contents).
/// If anything other than true is returned (including no defined return value at all)
/// the resize notification continues in a depth-first traversal of the DOM
ZLM.notifyResize=function(root) {
	arguments.callee.name="ZLM.notifyResize";
	if (root==null) root=document.body;
	// 2008-03-05:SAM changed traversal of kid list from linked list to indexed array
	// apparently IE7 stores the list as an array and is not very good about keeping
	// next and previous sibling pointers up to date
	for (var i=0;i<root.childNodes.length;i++) {
		kid=root.childNodes[i];
		if (kid.nodeType==1) {
			var fn=kid.getAttribute("onresize");
			if (fn && !kid.onresize) {
				var fnBody = new Function(fn);
				kid.onresize=fnBody;
			}
			if (kid.onresize) {
				ZLM.notifyTarget=kid;
				var skipKids=kid.onresize();
				ZLM.notifyTarget=null;
				if (skipKids!=true) ZLM.notifyResize(kid);
			}
			else ZLM.notifyResize(kid);
		}
	}
}

/// Force a geometry recalculation for all managed groups and bound elements
ZLM.refreshLayout=function() {
	for (var i=0;i<ZLM.managedGroups.length;i++)
		ZLM.managedGroups[i].layoutBlock(ZLM.managedGroups[i].engine);
	for (var i=0;i<ZLM.boundElements.length;i++)
		ZLM.boundElements[i].refresh();
}

////////////////////////////
// PART I QUERY FUNCTIONS //
////////////////////////////

// Given a registered client side manager, return the system index of the
// root HTML Div controlled by that manager, or -1 if there is no such
// group registered
ZLM.findGroupIdxByManager=function(mgr) {
	for (var idx=0; idx < ZLM.managedGroups.length; idx++)
		if (ZLM.managedGroups[i]==mgr) return(idx);
	return(-1);
}

// Given the HTML root div of a managed group, return the system index for the element
// or -1 id there is not such group registered
ZLM.findGroupIdxByRoot=function(root) {
	for (var idx=0; idx < ZLM.managedGroups.length; idx++)
		if (ZLM.managedGroups[idx].root==root) return(idx);
	return(-1);
}

// Given the group ID for a managed group, return a pointer to the HTML root div with a
// matching ID or null if there is no such group registered
ZLM.getGroupRoot=function(groupName) {
	for (var i=0;i<ZLM.managedGroups.length;i++)
		if (ZLM.managedGroups[i].rootId == groupName) return(ZLM.managedGroups[i].root);
	return(null);
}

// Given the group ID for a managed group, return a pointer to the manager object for the group
// or null if there is no such group registered
ZLM.getGroupManager=function(groupName) {
	for (var i=0;i<ZLM.managedGroups.length;i++)
		if (ZLM.managedGroups[i].rootId == groupName) return(ZLM.managedGroups[i]);
	return(null);
}

// Given the scoping class name of a previously registered client side layout manager,
// Return the system index of that manager object or -1 if the manager has not yet been registered
ZLM.getManagerIdx=function(classPrefix) {
	for(var i=0;i<ZLM.managers.length;i++)
		if (ZLM.managers[i].prefix==classPrefix) return(i);
	return(-1);
}

// Given a pointer to an HTML div element, return the system index of the bound element controller
// object or -1 if the given element is not registered as a bound element.
ZLM.getBoundElementIdx=function(e) {
	for (var i=0;i<ZLM.boundElements.length;i++) {
		if (ZLM.boundElements[i].absE==e) return(i);
	}
	return(-1);
}

////////////////////////////////////
// PART I INITIALIZATION ROUTINES //
////////////////////////////////////

/// Given a pointer to a Javascript object, an HTML div (root of a DOM subtree)
/// controlled by that object and class name of the JS object, initialize an
/// intance of this object with a standard set of attribute
/// Within the new object:
///	this.div will point to the DOM Node
///	this.objClass will contain the textual name of the JS Class
///	this.instanceNum will be a unique ID number for the instance
/// Within the class:
///	objClass.registerInstance will be a function to give each instance
///		within the class a unique ID number
///	objClass.registry will be an array of pointers to all known instances
/// Within the DOM node:
///	this.controller will be a pointer back to the JS object
ZLM.initializeObject=function(obj,div,objClass) {
	var oC=eval(objClass);
	obj.base=div;
	if (div!=null) div.controller=obj;
	obj.objClass=objClass;

	var r=oC.registry;
	if (!r) {
		oC.registry=[];
		eval(objClass+".registerInstance = function(objClass,obj){var r="+objClass+".registry;r.push(obj);return(r.length-1)};");
	}

	obj.instanceNum=oC.registerInstance(objClass,obj);
	obj.objHook=objClass+".registry["+obj.instanceNum+"].";

}

/// Given a floating element (absE), and inline element (baseE) and geometry
/// constraints (hOffset, vOffset, hSize & vSize), create a new bound element
/// controller tying the two HTML divs together and register the new controller
/// with the system.
ZLM.addBoundElement=function(absE, baseE, hOffset, vOffset, hSize, vSize) {
	var b = new ZLM.BoundElement(absE,baseE,hOffset,vOffset,hSize,vSize);
	var idx=ZLM.getBoundElementIdx(absE);
	if (idx== -1) idx=ZLM.boundElements.length;
	b.refresh();
	ZLM.boundElements[idx]=b;
}

// Given a group under the control of a client-side layout manager, register this
// group with the system layout controller
ZLM.addManagedGroup=function(mgr) {
	var insertIdx = 0;
	while (insertIdx<ZLM.managedGroups.length && ZLM.managedGroups[insertIdx].nodeDepth>mgr.nodeDepth) insertIdx++;
	for (var i=ZLM.managedGroups.length;i>insertIdx;i--) {
		ZLM.managedGroups[i]=ZLM.managedGroups[i-1];
	}
	ZLM.managedGroups[insertIdx]=mgr;
}

/// Grow the list of known client-side layout managers by creating a new
/// manager object consisting of the class (or class prefix) and the entry
/// point for the manager
///  classPrefix: all DIVs to be managed by this layout with have their class start with this string
///  initFunction: the function to call (being passed a DivLayout object) to initialize an instance
///                of the layout manager and to get back the entry points for various layout functions
///
ZLM.registerManagerClass=function(classPrefix, initFunction) {
	if (ZLM.getManagerIdx(classPrefix)>=0) return; // already registered
	var mgr = new Object();
	mgr.prefix = classPrefix;
	mgr.init = initFunction;
	mgr.initialized = 0;
	ZLM.managers[ZLM.managers.length]=mgr;
}

/// Scan the page for any DIVs that require special handling based on the class names for
/// the handlers currently registered on file.
ZLM.initLayout=function() {
	for (var i=0;i< ZLM.managers.length; i++) {
		if (ZLM.managers[i].initialized==0 || true) { // unconditional to address dynamic elements
			if (ZLM.isIE) {
				var done=false;
				while (!done) {
					var blocks = ZLM.getElementsByClassPrefix( ZLM.managers[i].prefix, document.body);
					if (!blocks) done=true;
					else {
						var l=blocks.length;
						done = true;
						for (var j=0;j<l;j++) {
							if (!blocks[j].mgrInitialized) {
								var mgr = new ZLM.ManagedArea(ZLM.managers[i].prefix,blocks[j]);
								ZLM.managers[i].init(mgr);
								ZLM.addManagedGroup(mgr);
								blocks[j].mgrInitialized=true;
								done=false; // keep cranking until we don't have any work to do
								j=l;
							}
						}
					}
				}
			}
			else {
				var blocks = ZLM.getElementsByClassPrefix( ZLM.managers[i].prefix, document.body);
				if (blocks!=null) {
					for (var j=0;j<blocks.length;j++) {
						if (!blocks[j].mgrInitialized) {
							var mgr = new ZLM.ManagedArea(ZLM.managers[i].prefix,blocks[j]);
							ZLM.managers[i].init(mgr);
							ZLM.addManagedGroup(mgr);
							blocks[j].mgrInitialized=true;
						}
					}
				}
			}
			ZLM.managers[i].initialized=1;
		}
	}
	ZLM.refreshLayout();
}


////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//                     PPPP   AAA  RRRR  TTTTT    III III                     //
//                     P   P A   A R   R   T       I   I                      //
//                     PPPP  AAAAA RRRR    T       I   I                      //
//                     P     A   A R   R   T       I   I                      //
//                     P     R   R R   R   T      III III                     //
//                                                                            //
//                        Drag & Drop management stuff                        //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

// All drag-able elements on a page are to be registered with this utility
// via the wrapDragItem function.  The resigistration process creates
// our own object for rapid location and access to the elements in question
// at run time.  These reference objects consist of the following information:
//   minW    : the minimum width this element should ever occupy
//   minH    : the minimum height this element should ever occupy
//   groupID : the tag associated the ancestor DIV of all peer drag-ables
//   node    : the DOM element itself
//
// All such objects for a given page are stored in a local data array (called ZLM.stones)

///////////////////
//  GLOBAL DATA  //
///////////////////

ZLM.stones = new Array();      // Look-up list of drag-able objects
ZLM.stoneInHand = null;        // The object currently BEING dragged, if any

///////////////////////////////
// PART II LIBRARY FUNCTIONS //
///////////////////////////////

/////////////////////////////////////////////////////////
// PART II INTENRAL DRAG-DROP LAYOUT SUPPORT FUNCTIONS //
/////////////////////////////////////////////////////////

// Given a registered, dragable DOM subtree (wrapper), called the startDrag
// handler function of the subtree's manager (if defined)
ZLM.startDrag=function(wrapper) {
	var mgr = wrapper.manager;
	if (mgr.startDrag) mgr.startDrag(mgr.engine,wrapper);
}

// Given a registered, dragable DOM subtree (wrapper), called the endDrag
// handler function of the subtree's manager (if defined)
ZLM.endDrag=function(wrapper) {
	var mgr = wrapper.manager;
	if (mgr.endDrag) mgr.endDrag(mgr.engine,wrapper);
}

// Given a registered, dragable DOM subtree (wrapper), called the constrainDragX
// handler function of the subtree's manager (if defined) passing it the intended X
// location of the drag (as well as the usual bookkeeping pointers).  If the manager's
// function is defined, return its constrained value of X to the drag manager.  If
// there is no handler to call, simply return the intended X value as the processed
// result.
ZLM.constrainDragX=function(wrapper, intendedX) {
	var mgr = wrapper.manager;
	if (mgr.constrainDragX) return(mgr.constrainDragX(mgr.engine,wrapper,intendedX));
	return(intendedX);
}

// Given a registered, dragable DOM subtree (wrapper), called the constrainDragY
// handler function of the subtree's manager (if defined) passing it the intended Y
// location of the drag (as well as the usual bookkeeping pointers).  If the manager's
// function is defined, return its constrained value of Y to the drag manager.  If
// there is no handler to call, simply return the intended Y value as the processed
// result.
ZLM.constrainDragY=function(wrapper, intendedY) {
	var mgr = wrapper.manager;
	if (mgr.constrainDragY) return(mgr.constrainDragY(mgr.engine,wrapper,intendedY));
	return(intendedY);
}

// Force the given node to come first in the stacking order reletive to
// the other members of the matrix.
ZLM.bringToFront=function(wrapper) {
	wrapper.node.style.zIndex=ZLM.getStoneCount();
}

////////////////////////////////////////////////////////
// GENERAL REPORTING FUNCTIONS FOR DEBUGGING PURPOSES //
////////////////////////////////////////////////////////

/// For debugging purposes, stream a list of all registered drag elements on the page
/// to the error message window
ZLM.reportDragElements=function() {
	var s = "Total drag-able elements on file: "+ZLM.stones.length+ " by ID: ";
	for (var i=0;i<ZLM.stones.length;i++) {
		s += ZLM.stones[i].node.id+"("+i+") ";
	}
	ZLM.cerr(s);
}

//////////////////////////////
//  GLOBAL QUERY FUNCTIONS  //
//////////////////////////////

// Search the Stones list and return the wrapper associated with the
// given HTML element
ZLM.getWrapper=function(DOMElement) {
	for (var i=0;i<ZLM.stones.length;i++) {
		if (ZLM.stones[i].node==DOMElement) return(ZLM.stones[i]);
	}
	return(null);
}

// Return the number of currently registered draggable objects
ZLM.getStoneCount=function() {
	return(ZLM.stones.length);
}

/////////////////////////////////////////
// STONE LIST MANAGEMENT AND UTILITIES //
/////////////////////////////////////////

// Create a drag wrapper around a DOM node or subtree (DOMElement) and
// designate a drag manager (manager) as its position curator
ZLM.wrapDragItem=function(DOMElement, manager) {
	var wrapper = new Object();
	wrapper.minW = DOMElement.offsetWidth;
	wrapper.minH = DOMElement.offsetHeight;
	wrapper.edgeW = 2*ZLM.getEdgeWidth(DOMElement);
	wrapper.edgeH = 2*ZLM.getEdgeHeight(DOMElement);
	wrapper.node = DOMElement;
	wrapper.manager = manager;
	return(wrapper);
}

/// Register a DOM node or subtree (DOMElement) as having the potential to be
/// dragged and designate a drag manager (manager) as the curator of the element's
/// position.  A drag wrapper (an object binding the DOM element to a position
/// manager, is returned tothe caller.  A drag manager needs to be a JavaScript
/// object with one or more of the following methods defined: startDrag; endDrag;
/// constrainDragX; constrainDragY.
ZLM.registerDragItem=function(DOMElement, manager) {
	var wrapper=ZLM.wrapDragItem(DOMElement, manager);
	ZLM.stones[ZLM.stones.length]=wrapper;
	return(wrapper);
}

//////////////////////////////////////////
//  CORE DRAG MANAGEMENT FUNCTIONALITY  //
//////////////////////////////////////////

/// Drag previously registered, absolutely positioned HTML elements
///
/// element: either the element that received the initial mousedown event
///          or one of its containers.  To work properly the element must have been
///          positioned using absolute positioning initially.  Its style.left and
///          style.top values will be changed based on the motion of the drag
///
/// event: the event object from the initial mousedown event
///
ZLM.drag=function(element, event) {
	if (ZLM.stoneInHand!=null) return;
	var wrapper = ZLM.getWrapper(element); // look up item to get actual our node wrapper
	ZLM.stoneInHand=wrapper;
	if (wrapper==null) return;
	ZLM.startDrag(wrapper);  //External call to whatever layout manager is in effect

	// get the start location of the drag in window coordinates
	var startX = event.clientX;
	var startY = event.clientY;

	// get the initial position of the element being dragged (this is in doc coordinates)
	var origX = element.offsetLeft;
	var origY = element.offsetTop;

	var deltaX = startX-origX;
	var deltaY = startY-origY;

	// register event handlers that will deal with the succeeding events needed to complete the drag
	// operation (mousemove & mouseup).  Unfortunately different browsers do this differently
	// so the code is a bit more complex than it would be to support DOM 2 alone
	if (document.addEventListener) { // DOM Lvl 2
		document.addEventListener("mousemove",moveHandler,true);
		document.addEventListener("mouseup",upHandler,true);
	}
	else if (document.attachEvent) { // IE 5+
		element.setCapture();
		element.attachEvent("onmousemove",moveHandler);
		element.attachEvent("onmouseup",upHandler);
	}
	else {  // IE 4 - no guarantees
		var oldmovehandler = document.onmousemove;  // upHandler will need this later
		var olduphandler = document.onmouseup;
		document.onmousemove = moveHandler;
		document.onmouseup = upHandler;
	}

	// prevent event propagation to other handlers
	if (event.stopPropagation) event.stopPropagation();  // DOM 2
	else event.cancelBubble = true;                      // IE

	// lock out any default handling
	if (event.preventDefault) event.preventDefault(); // DOM 2
	else event.returnValue = false;                   // IE

	// Now define a couple internal functions the handle the rest of the drag operation

	// This handler captures mouse move event while the element is being dragged
	// It moves the element and swallows the event.  It is important to keep this
	// short and sweet as dragging is an expensive operation and doing it in an
	// interpreted environment only makes things worse
	function moveHandler(e) {
		if (!e) e = windowevent;  // another IE workaround
		var notIE9 = (navigator.userAgent.split("MSIE 9.0").length !=2);
		if (notIE9 && e.buttons==0) {
			upHandler(e);
			return;
		}
		// move element reletive to initial location of the drag
		element.style.left = ZLM.constrainDragX(wrapper, e.clientX - deltaX) + "px";
		element.style.top = ZLM.constrainDragY(wrapper, e.clientY - deltaY) +"px";

		// Now effectively kill the event
		if (event.stopPropagation) event.stopPropagation();  // DOM 2
		else event.cancelBubble = true;                      // IE
	}  // End of moveHandler

	// This handler wraps up the drag by capturing the ending mouseup event
	function upHandler(e) {
		if (!e) e = windowevent;  // another IE workaround
		ZLM.dragEndEvent=e;
		// external call to layout manager for final placement
		ZLM.endDrag(wrapper);
 		// remove the drag specific event handlers
		if (document.removeEventListener) { // DOM 2
			document.removeEventListener("mouseup",upHandler,true);
			document.removeEventListener("mousemove",moveHandler,true);
		}
		else if (document.detachEvent) {  // IE 5
			element.detachEvent("onmouseup",upHandler);
			element.detachEvent("onmousemove",moveHandler);
			element.releaseCapture();
		}
		else {  // IE 4
			document.onmouseup = olduphandler;
			document.onmousemove = oldmovehandler;
		}
		// Now effectively kill the event
		if (event.stopPropagation) event.stopPropagation();  // DOM 2
		else event.cancelBubble = true;                      // IE
		ZLM.stoneInHand=null;
	} // End of upHandler
} // End of drag

/// EXPERIMENTAL SECTION FOR IPAD
/// touch drag previously registered, absolutely positioned HTML elements
///
/// element: either the element that received the initial touchstart event
///          or one of its containers.  To work properly the element must have been 
///          positioned using absolute positioning initially.  Its style.left and
///          style.top values will be changed based on the motion of the drag
///
/// event: the event object from the initial touchstart event
///

ZLM.touch=function(element, event) {
	if (ZLM.stoneInHand!=null) return;
	var wrapper = ZLM.getWrapper(element); // look up item to get actual our node wrapper
	ZLM.stoneInHand=wrapper;
	if (wrapper==null) return;
	if (event.touches.length!=1) return; // only deal with one finger
	var touch = event.touches[0];
	ZLM.startDrag(wrapper);  //External call to whatever layout manager is in effect

	// get the start location of the drag in window coordinates
	var startX = touch.pageX;
	var startY = touch.pageY;

	// get the initial position of the element being dragged (this is in doc coordinates)
	var origX = element.offsetLeft;
	var origY = element.offsetTop;

	var deltaX = startX-origX;
	var deltaY = startY-origY;

	// register event handlers that will deal with the succeeding events needed to complete the drag
	// operation (mousemove & mouseup).  Unfortunately different browsers do this differently 
	// so the code is a bit more complex than it would be to support DOM 2 alone
	if (document.addEventListener) { // DOM Lvl 2
		document.addEventListener("touchmove",moveHandler,true);
		document.addEventListener("touchend",endHandler,true);
	}

	// prevent event propagation to other handlers
	if (event.stopPropagation) event.stopPropagation();  // DOM 2

	// lock out any default handling
	if (event.preventDefault) event.preventDefault(); // DOM 2

	// Now define a couple internal functions the handle the rest of the drag operation

	// This handler captures mouse move event while the element is being dragged 
	// It moves the element and swallows the event.  It is important to keep this 
	// short and sweet as dragging is an expensive operation and doing it in an 
	// interpreted environment only makes things worse
	function moveHandler(e) {
		var t=e.touches[0];
		// move element reletive to initial location of the drag
		element.style.left = ZLM.constrainDragX(wrapper, t.clientX - deltaX) + "px";
		element.style.top = ZLM.constrainDragY(wrapper, t.clientY - deltaY) +"px";

		// Now effectively kill the event
		if (event.stopPropagation) event.stopPropagation();  // DOM 2
	};  // End of moveHandler

	// This handler wraps up the drag by capturing the ending mouseup event
	function endHandler(e) {
		ZLM.dragEndEvent=e;
		var t=e.touches[0];
		// external call to layout manager for final placement
		ZLM.endDrag(wrapper);
 		// remove the drag specific event handlers 
		if (document.removeEventListener) { // DOM 2
			document.removeEventListener("touchend",endHandler,true);
			document.removeEventListener("touchmove",moveHandler,true);
		}
		// Now effectively kill the event
		if (event.stopPropagation) event.stopPropagation();  // DOM 2
		ZLM.stoneInHand=null;
	} // End of upHandler
}; // End of touch



/// For new objects being added to the page via an initial Drag operation
/// register the new object in our own internal tables and add it to the page
/// as an absolutely positioned, but currently mobile element
///
/// newElement : the DOM element to add to the page
/// initX: the initial horizontal position of the element
/// initY: the initial vertical position of the element
/// manager: the drag manager responsible for constraining this elements position on the page
///
	ZLM.touchMoveCount = 0;
	ZLM.touchEndIgnore = 1;

ZLM.registerNewObjectInHand=function(newElement, initX, initY, manager) {
	// add new object to the list of dragable elements
	var wrapper = ZLM.wrapDragItem(newElement, manager);
	ZLM.stones[ZLM.stones.length]= wrapper;
	// get the start location of the drag in window coordinates
	var startX = initX;
	var startY = initY;
	var origX = startX;
	var origY = startY;

	var deltaX = 0;
	var deltaY = 0;

	// register event handlers that will deal with the succeeding events needed to complete the drag
	if (document.addEventListener) { // DOM Lvl 2
		document.addEventListener("mousemove",moveHandler,true);
		document.addEventListener("mouseup",upHandler,true);
		// SAFARI MOBILE SUPPORT
		if (ZLM.isiOS) {
			document.addEventListener("touchmove",touchMoveHandler,true);
			document.addEventListener("touchend",skipFirstEnd,true);
		}
	}
	else if (document.attachEvent) { // IE 5+
		newElement.setCapture();
		newElement.attachEvent("onmousemove",moveHandler);
		newElement.attachEvent("onmouseup",upHandler);
	}
	else {  // IE 4 - no guarantees
		var oldmovehandler = document.onmousemove;  // upHandler will need this later
		var olduphandler = document.onmouseup;
		document.onmousemove = moveHandler;
		document.onmouseup = upHandler;
	}
	return(wrapper);

	// This handler captures mouse move event while the element is being dragged
	// It moves the element and swallows the event.
	function moveHandler(e) {
		if (!e) e = windowevent;  // another IE workaround
		// move element reletive to initial location of the drag
		newElement.style.left = ZLM.constrainDragX(wrapper, e.clientX - deltaX) + "px";
		newElement.style.top = ZLM.constrainDragY(wrapper, e.clientY -deltaY) +"px";
	}

	// This handler captures touch move event while the element is being dragged 
	// It moves the element and swallows the event.  It is important to keep this 
	// short and sweet as dragging is an expensive operation and doing it in an 
	// interpreted environment only makes things worse
	function touchMoveHandler(e) {
		var t=e.touches[0];
		deltaX = window.pageXOffset;
		deltaY = window.pageYOffset;
		// move element reletive to initial location of the drag
		newElement.style.left = ZLM.constrainDragX(wrapper, t.clientX - deltaX) + "px";
		newElement.style.top = ZLM.constrainDragY(wrapper, t.clientY - deltaY) +"px";

		// Now effectively kill the event
		ZLM.killEvent(e);
	};  // End of moveHandler

	// This handler wraps up the drag by capturing the ending mouseup event
	function upHandler(e) {
		if (!e) e = windowevent;  // another IE workaround
		ZLM.dragEndEvent=e;
		// external call to layout manager for final placement
		ZLM.endDrag(wrapper);
		// remove the drag specific event handlers
		if (document.removeEventListener) { // DOM 2
			document.removeEventListener("mouseup",upHandler,true);
			document.removeEventListener("mousemove",moveHandler,true);
		}
		else if (document.detachEvent) {  // IE 5
			newElement.detachEvent("onmouseup",upHandler);
			newElement.detachEvent("onmousemove",moveHandler);
			newElement.releaseCapture();
		}
		else {  // IE 4
			document.onmouseup = olduphandler;
			document.onmousemove = oldmovehandler;
		}
	} // End of upHandler

	// This handler wraps up the drag by capturing the touch end event
	function skipFirstEnd(e) {
		document.removeEventListener("touchend",skipFirstEnd,true);
		document.addEventListener("touchend",touchEndHandler,true);
		ZLM.killEvent(e);
	}

	function touchEndHandler(e) {
		ZLM.dragEndEvent=e;
		ZLM.stoneInHand=null;
		var t=e.touches[0];
 		// remove the drag specific event handlers 
		if (document.removeEventListener) { // DOM 2
			document.removeEventListener("touchend",touchEndHandler,true);
			document.removeEventListener("touchmove",touchMoveHandler,true);
		}
		// external call to layout manager for final placement
		ZLM.endDrag(wrapper);
		// Now effectively kill the event
		ZLM.killEvent(e);
	} // End of tEndHandler


} // end of registration


//////////////////////////////////////////
//////////////////////////////////////////

//##################################
//#                                #
//# DATA DRAG DROP SUPPORT LIBRARY #
//#                                #
//##################################

//==============================//
// DDD INITIALIZATION FUNCTIONS //
//==============================//

ZLM.dddInitPending=false;

// Request that data drag drop be initialized
ZLM.requestDataDragDropInit=function() {
	if (ZLM.dddInitPending) return;
	ZLM.dddInitPending=true;
	setTimeout("ZLM.initDataDragDrop();ZLM.dddInitPending=false;",250);
}

/// Initialize internal tables and enable the default drag manager for
/// all elements with the defined attributes of "ondatadrag" and "ondatadrop"
ZLM.initDataDragDrop=function() {
	ZLM.initTargetNodes();
	ZLM.dragManager = new ZLM.DragManager();
	ZLM.mouseDown = 0;      // status of mouse button
	ZLM.dragActive = 0;     // status of data drag subsystem
	ZLM.dragSource = null;  // bookmark of where drag began
	ZLM.dragInnerSource = null; // innermost Div of drag source to trip
	ZLM.dragDest = null;    // element where drag ended
	ZLM.dragInnerDest=null; // innermost Div of drag destination to trip
	ZLM.dragAvatar = null;  // temporary visual element to display as data is being dragged
	ZLM.dragCaption = null; // string to display during drag operation
	ZLM.dragData = null;    // data to pass to drop object
	ZLM.dragStartEvent = null; // DOM event that triggered start of drag
	ZLM.dragEndEvent = null; // DOM event that triggered end of drag

	ZLM.dragStartX = -1;
	ZLM.dragStartY = -1;
}

/// Identify all elements on the page that have the attributes "ondatadrag" and
/// "ondatadrop" defined.  All such elements are registered with the system as
/// potential drag sources and drop zones.  This function is called automatically
/// as part of the ZLM.initDataDragDrop() service but may also be invoked manually
/// to rescan the DOM if elements have been dynamically added or removed from the page
ZLM.initTargetNodes = function() {
	ZLM.dragDivs = ZLM.findElementsByDefinedAttribute(document.body,"ondatadrag");
	ZLM.dropDivs = ZLM.findElementsByDefinedAttribute(document.body,"ondatadrop");
	/* Possible upgrade below as replacement for above two lines
	var n=document.body.getElementsByTagName("*");
	ZLM.dragDivs = ZLM.filterElementsByDefinedAttribute(n,"ondatadrag");
	ZLM.dropDivs = ZLM.filterElementsByDefinedAttribute(n,"ondatadrop");
	--- END possible upgrade */

	for (var i=0;i<ZLM.dragDivs.length;i++) {
		ZLM.enableDataDragDrop(ZLM.dragDivs[i]);
	}
	for (var i=0;i<ZLM.dropDivs.length;i++) {
		ZLM.enableDataDragDrop(ZLM.dropDivs[i]);
	}
}

/// Register the given element (who) as a data-drag-drop(DDD) enabled widget
/// When a drag on a container is detected, the user-supplied dragHandler is
/// called to create the string buffer of data to drag.  If a drop is detected,
/// the user-supplied drop handler is called to extract specific datum from
/// the drag buffer.  This function is automatically called on all element
/// in the DOM with a defined "ondatadrag" or "ondatadrop" attribute as part
/// of the ZLM.initTargetNodes() service, but it may also be called on individual
/// elements as they are added to the page for a more dynamic operation. It should
/// be noted that enabling data drag drop on an element locks out the onmousedown,
/// mousemove and onmouseup event traps for the element.  Page designers should
/// plan accordingly.
ZLM.enableDataDragDrop=function(who) {
	if (who) {
		if (ZLM.hasAttribute(who,"ondatadrag")) {
			who.zenDragHandler=who.getAttribute("ondatadrag");
			// on mouse down is the primative that could (potentially)
			// imply the start of a data drag operation.  Unfortunately
			// it is a necessary but not sufficient precondition to assume
			// a drag.  We'll need to install a handler that will check
			// for other preconditions.
			ZLM.setLocalAttribute(who,"onmousedown","ZLM.setButtonStatus(event,this);");
			// The way the system is set up, the page will actually be
			// notified by the zenCSLM library when a drag in progress is
			// completed.  The trap on "onmouseup" is just a safety net
			// to ensure that non-drag mouse actions and abort drag operations
			// don't confuse the status flags.
			ZLM.setLocalAttribute(who,"onmouseup","ZLM.setButtonStatus(event,this);");
			// SAFARI MODILE SUPPORT
			if (ZLM.isiOS) {
				ZLM.setLocalAttribute(who,"ontouchstart","ZLM.setTouchStatus(event,this);");
				ZLM.setLocalAttribute(who,"ontouchend","ZLM.setTouchStatus(event,this);");
			}
		}
		else who.zenDraghandler==null;

		if (ZLM.hasAttribute(who,"ondatadrop")) who.zenDropHandler=who.getAttribute("ondatadrop");
		else who.zenDropHandler=null;
	}
}

//=======================//
// DDD Utility Functions //
//=======================//
ZLM.eventBackup=null;

// Handle mouse button events as "pre-drag" event indicators setting
// status flags and installing mouse motion monitors as warrented.  <br>
// AS AN ASIDE, dataDrag is a purely synthetic event that the W3C never
// included in the DOM standard.  It would be nice to say "if the user
// exits the widget (onmouseout event) with the mouse button down, it's
// a data drag"  Unfortunately, event handling within browsers is one
// step shy of random and trying to get cross platform behavior is
// maddening.  The DOM standard only reports mouse button transitions
// so you can't query the state of the button during an mouseOut event.
// On most browsers, mouseDown locks out all other events except mouseMove
// and mouseUp and queues the rest up afterwards.  If you try to capture
// state of the mouse button using a mouseDown event it calls mouseUp before
// mouseOut such that the user's drag gesture is complete before the program
// gets a chance to process/animate it.
ZLM.setButtonStatus=function(event, who) {
	if (event.isRebroadcast) return;

	// if a suspected drag is active, all button activity terminates
	// it.  If it were a valid drag operation, endDrag would have been
	// called to complete data transfer stuff, so all we need to worry
	// about here is workspace cleanup.
	if (ZLM.dragActive) {
		ZLM.dragActive=0;
		ZLM.dragSource=null;
		ZLM.dragInnerSource=null;
	}
	// A mouse down event could be the start of a drag. Install a mousemove
	// listener to see if the user leaves the bounds of the widget while
	// still holding down the mouse button.
	if (event.type=="mousedown") {
		if (ZLM.eventBackup) {
			return(true);
		}
		ZLM.eventBackup=event;

		//IE doesn't know what do with scrollbars so let's check those first (holdover)
		if (ZLM.isIE && !ZLM.isEventPtWithin(event,who)) return;

		ZLM.dragSource=who;
		ZLM.dragInnerSource = ZLM.findElementAt(who,event.clientX+ZLM.getPageXOffset(), event.clientY+ZLM.getPageYOffset());

		// Again check for an IE screw-up (holdover)
		if (ZLM.isIE && !ZLM.isEventPtWithin(event,ZLM.dragInnerSource)) return;

		// set flag showing that pre-condition 1 has been met
		ZLM.mouseDown=1;
		// monitor mouse motion for a dragging exit from the space
		if (ZLM.isIE) {
			who.setCapture();
			who.attachEvent("onmousemove",ZLM.ieDDDHandler);
		}
		else {
			document.addEventListener("mousemove",ZLM.isDrag,true);
		}
		// JMD632
		if (event.target && event.target.tagName=='input') return;
		ZLM.killEvent(event);
		return(false);
	}
	else {
		// A mouse up both negates the pre-condition
		// Since the pre-condition is no longer valid, don't both monitoring the mouse motion.
		ZLM.killMouseGrab(who);
		if (ZLM.eventBackup) {
			var s=ZLM.eventBackup;

			// JMD632
			var e = null;
			if (s.initMouseEvent) { // all modern browsers
				e=document.createEvent("MouseEvent");
				e.initMouseEvent(s.type,s.bubbles,s.cancelable,s.view,s.detail,s.screenX,s.screenY,s.clientX,s.clientY,s.ctrlKey,s.altKey,s.shiftKey,s.metaKey,s.button,null);
				e.isRebroadcast=true;
				if (s.target && s.target.focus) {
					setTimeout("document.getElementById('"+s.target.id+"').focus();",50);
				}
				if (s.target && s.target.dispatchEvent) s.target.dispatchEvent(e);
			}
			else if (document.createEventObject) { // dinosaur code (IE)
				e=document.createEventObject(s);
				e.button = 1;
				e.isRebroadcast=true;
				if (s.srcElement && s.srcElement.focus) s.srcElement.focus();
				if (s.srcElement && s.srcElement.fireEvent) s.srcElement.fireEvent("onmousedown",e);
			}
		}
		ZLM.eventBackup=null;
		ZLM.mouseDown=0;
	}
	return(true);
}

// SAFARI MOBILE SUPPORT
// Touch state idea:
// 1) touch with one finger
// 2) tap with second finger (touch start, touch end, minimal movement)
// 3) enable drag as object in hand

ZLM.touchState = 4;
ZLM.touchTimeStamp = 0;

// Handle touch events as "pre-drag" event indicators setting
// status flags and installing motion monitors as warrented.  <br>
ZLM.setTouchStatus=function(event, who) {
	// Implement a small state machine to track the start of a drag opeation
	// 1) touch with one finger
	// 2) tap with second finger (touch start, touch end, minimal movement)
	// 3) enable drag as object in hand
	var now = new Date().getTime();
	var delta = now-ZLM.touchTimeStamp;
	var noJoy = false;
	var eType = event.type;
	var touch = event.touches;
	var tLen = touch.length;
	switch(ZLM.touchState) {
		case 0:
			if (eType=="touchstart" && tLen==1) {
				ZLM.touchState = 1; // look for second touch before move
				ZLM.touchTimeStamp = now;
				ZLM.dragSource=who;
				ZLM.dragInnerSource = ZLM.findElementAt(who,touch[0].pageX, touch[0].pageY);
				ZLM.dragStartEvent=event;
				ZLM.dragEndEvent=null;
			}
			break;
		case 1:
			if (eType=="touchstart" && tLen==2 && delta<1500) {
				ZLM.touchState = 2; // look for timely un-touch of second finger
				ZLM.touchTimeStamp = now;
			}
			else noJoy=true;
			break;
		case 2: 
			if (eType=="touchend" && delta<500) {
				// Commence drag operation...
				who=ZLM.dragSource;
				// JMD632
				var target = ZLM.dragStartEvent.touches[0].target;
				if (target && target.blur) target.blur();
				// reset the drag caption (user handler may change this as desired)
				ZLM.dragCaption="Data Drag...";
				ZLM.dragAvatar=null;
				// destination is unknown
				ZLM.dragDest = null;
				// flag this as a drag in progress
				ZLM.dragActive=1;
				// ask the local drag handler to give us the drag data
				ZLM.dragData=eval(who.zenDragHandler);
				// Create visual avatar of dragged object (and begin drag action)//alert('drag detected, asking for data and avatar'+ZLM.dragData);
				ZLM.dragStartX = ZLM.dragStartEvent.touches[0].clientX;
				ZLM.dragStartY = ZLM.dragStartEvent.touches[0].clientY;
				if (ZLM.dragData) ZLM.createDragAvatar();
				else noJoy=true;
				//ZLM.killEvent(event);
				break;
			}
			else noJoy=true;
			break;
		case 4: 
			if (eType=="touchstart") {
				ZLM.dragSource=who;
				ZLM.dragInnerSource = ZLM.findElementAt(who,touch[0].pageX, touch[0].pageY);
				ZLM.dragStartEvent=event;
				ZLM.dragEndEvent=null;
				// Commence drag operation...
				// JMD632
				var target = event.touches[0].target;
				if (target && target.blur) target.blur();
				// reset the drag caption (user handler may change this as desired)
				ZLM.dragCaption="Data Drag...";
				ZLM.dragAvatar=null;
				// destination is unknown
				ZLM.dragDest = null;
				// flag this as a drag in progress
				ZLM.dragActive=1;
				// ask the local drag handler to give us the drag data
				ZLM.dragData=eval(who.zenDragHandler);
				// Create visual avatar of dragged object (and begin drag action)//alert('drag detected, asking for data and avatar'+ZLM.dragData);
				ZLM.dragStartX = event.touches[0].pageX+window.pageXOffset;
				ZLM.dragStartY = event.touches[0].pageY+window.pageYOffset;
				if (ZLM.dragData) ZLM.createDragAvatar();
				else noJoy=true;
				//ZLM.killEvent(event);
				break;
			}
			else noJoy=true;
			break;
	}
	if (noJoy) {
		ZLM.dragActive=0;
		ZLM.dragSource=null;
		ZLM.dragInnerSource=null;
		ZLM.dragStartX = -1;
		ZLM.dragStartY = -1;
		ZLM.eventBackup=null;
		ZLM.touchState = 4;
	}
	return;
}

// Handle touch events as "pre-drag" event indicators setting
// status flags and installing motion monitors as warrented.  <br>
ZLM.setTouchStatusOld=function(event, who) {
	// if a suspected drag is active, all button activity terminates
	// it.  If it were a valid drag operation, endDrag would have been
	// called to complete data transfer stuff, so all we need to worry
	// about here is workspace cleanup.
	if (ZLM.dragActive) {
		ZLM.dragActive=0;
		ZLM.dragSource=null;
		ZLM.dragInnerSource=null;
		ZLM.dragStartX = -1;
		ZLM.dragStartY = -1;
	}
	// A touch start event could be the start of a drag. Install a touchmove
	// listener to see if the user leaves the bounds of the widget while
	// still holding down the mouse button.
	if (event.type=="touchstart") {
		if (event.touches.length!=3) return(false);
		var touch = event.touches[0];
		ZLM.eventBackup=event;
		ZLM.dragSource=who;
		ZLM.dragInnerSource = ZLM.findElementAt(who,touch.pageX, touch.pageY);

		// set flag showing that pre-condition 1 has been met
		ZLM.mouseDown=1;
		// monitor mouse motion for a dragging exit from the space
		document.addEventListener("touchmove",ZLM.isDrag,true);

		// JMD632
		if (touch.target && touch.target.tagName=='input') return(false);
		ZLM.killEvent(event);
		return(false);
	}
	else {
		// A touchend negates the pre-condition
		ZLM.eventBackup=null;
		ZLM.mouseDown=0;
		// Since the pre-condition is no longer valid, don't both monitoring the mouse motion.
		ZLM.killMouseGrab(who);
	}
	return(true);
}

// Return true if the given even happend within the absolute bound of the given element,
// taking into account the possibility of a scrollbar and disllowing that region.
ZLM.isEventPtWithin=function(event,who) {
	var x=event.clientX-ZLM.getPageOffsetLeft(who)+ZLM.getPageXOffset();
	var y=event.clientY-ZLM.getPageOffsetTop(who)+ZLM.getPageYOffset();
	if (x<0 || y<0) return(false);
	var w=who.clientWidth;
	var h=who.clientHeight;
	if (w>0 && x>w) return(false);
	if (h>0 && y>h) return(false);
	return(true);
}

// Due to differences in the event models Internet Explorer needs an extra
// layer of processing to call the mouse motion monitor
ZLM.ieDDDHandler=function() {
	return(ZLM.isDrag(event,event.srcElement));
}

// Mouse motion monitor - a mouseDown event is not sufficient to imply
// that a data drag operation is required. To see if a true dataDrag event
// has occurred, the mouse must leave the widget area before a mouseUp
// event occurs.  If these conditions are met, turn off local mouse monitoring,
// set flags indicating the start of a drag, and kick off the drag operation
// itself.
ZLM.isDrag=function(event, who) {
	// This condition SHOULD never be true but some versions of IE barf without it
	if (ZLM.mouseDown==0) {
		ZLM.killMouseGrab(who);
		return(false);
	}
	who=ZLM.dragInnerSource;
	// get the relative position of the cursor with respect to the
	// the widget.  NOTE: this assumes that the page has not scrolled
	var x = event.clientX-ZLM.getAbsoluteOffsetLeft(who);
	var y = event.clientY-ZLM.getAbsoluteOffsetTop(who);
	var target = event.target;
	if (ZLM.isiOS && event.type=="touchmove") {
		if (event.touches.length!=3) {
			ZLM.dragActive=0;
			ZLM.dragSource=null;
			ZLM.dragInnerSource=null;
			ZLM.killMouseGrab(who);
			return; // don't screw up native gestures
		}
		var touch = event.touches[0];
		x = touch.pageX-ZLM.getPageOffsetLeft(who);
		y = touch.pageY-ZLM.getPageOffsetTop(who);
		target = touch.target;
	}
	// if the mouse is outside the bounds then the second pre-condition has been met
	if (x<=0 || y<=0 ||x>=who.clientWidth||y>=who.clientHeight) {
		ZLM.eventBackup=null;
		ZLM.dragStartEvent=event;
		ZLM.dragEndEvent=null;
		who=ZLM.dragSource;
		// turn off local mouse monitoring
		ZLM.killMouseGrab(who);
		// JMD632
		if (target && target.blur) target.blur();
		// reset the drag caption (user handler may change this as desired)
		ZLM.dragCaption="Data Drag...";
		ZLM.dragAvatar=null;
		// destination is unknown
		ZLM.dragDest = null;
		// flag this as a drag in progress
		ZLM.dragActive=1;
		// ask the local drag handler to give us the drag data
		ZLM.dragData=eval(who.zenDragHandler);
		// Create visual avatar of dragged object (and begin drag action)
		if (event.type == "touchmove" ) {
			ZLM.dragStartX = event.touches[0].clientX;
			ZLM.dragStartY = event.touches[0].clientY;
		}
		if (ZLM.dragData) ZLM.createDragAvatar();
		else {  // if the handler didn't fill the clipboard, abort the drag
			ZLM.dragActive=0;
			ZLM.dragSource=null;
			ZLM.dragInnerSource=null;
			ZLM.dragStartX = -1;
			ZLM.dragStartY = -1;
			return(true);
		}
	}
	ZLM.killBrowserSelectionProcess();
	ZLM.killEvent(event);
	return(false);
}

// Release a passive mouse grap from the given widget.  Grabbing mouse move
// events are computationally expensive and we don't want to keep them active
// any longer than absolutely necessary.  Due to differences in browser
// implentations this function only works for DOM level 2 browsers and
// IE 6 & 7
ZLM.killMouseGrab=function(who){
	if (ZLM.isIE) {
		who.detachEvent("onmousemove",ZLM.ieDDDHandler,true);
		who.releaseCapture();
	}
	else {
		document.removeEventListener("mousemove",ZLM.isDrag,true);
		//SAFARI MOBILE SUPPORT
		if (ZLM.isiOS) document.removeEventListener("touchmove",ZLM.isDrag,true);
	}
}

// To give the user some feedback as to what is being dragged, the
// system creates a "dragIcon" that travels with the mouse while the
// drag is active.  This icon is just a root level DOM subtree
// containing a text string.
ZLM.createDragAvatar=function(x, y) {
	ZLM.removeDragAvatar();
	if (ZLM.dragAvatar==null) { // if user handler hasn't specified an avatar
		// Create a new DOM element to hold the caption.
		ZLM.dragAvatar=ZLM.simulateTag("div id='zenDragAvatar' class='zenDragAvatar' style='position:absolute; display:block; background:white; border:1px solid blue; color:black;'");
		// According to DOM standards the text of the node is stored separately in a child node, so we need to create one and
		// add it to our icon DIV
		ZLM.dragAvatar.appendChild(document.createTextNode(ZLM.dragCaption));
		// The completed subtree exists in memory but will not be processed by the browser until it is added to the layout of
		// the page itself.  We do this by making it a child of the document body
	}
	ZLM.dragAvatar.style.position="absolute";
	document.body.appendChild(ZLM.dragAvatar);
	var x = ZLM.dragStartX;
	if (x<0) x=0;
	var y = ZLM.dragStartY;
	if (y<0) y=0;
	ZLM.dragAvatar.style.top=x+"px";
	ZLM.dragAvatar.style.left=y+"px";
	// Now, activate the animation by registering the dragIcon with the drag-animation library in zenCSLM.  As the
	// 'Object in hand' it will move with the mouse until the next mouseUp event occurs
	ZLM.registerNewObjectInHand(ZLM.dragAvatar,x,y,ZLM.dragManager);
	// For visibility, change the pointer to a crosshair during the drag to keep it from obscuring the text of the icon
	document.body.style.cursor="crosshair";
}

ZLM.removeDragAvatar=function() {
	var div = document.getElementById('zenDragAvatar');
	if (div) {
		document.body.removeChild(div);
		div.innerHTML="";
	}
}

//==================//
// DDD HELPER CLASS //
//==================//

// A drag manager is a JavaScript opject that defines methods for the routines:
//   startDrag: called at the start of a drag operation to do any instance specific initializations
//   endDrag: called at the end of the drag operation to wrap up any loose ends
//   constrainDragX: called after each pixel is traversed to allow the manager to reconcile any differences
//                   intended or otherwise, between the mouse tracking and the dragged object's horizontal location
//   constrainDragY: called after each pixel is traversed to allow the manager to reconcile any differences
//                   intended or otherwise, between the mouse tracking and the dragged object's vertical location
//

// Defines a default drag manager for the purposes of handling data drag drop operations
ZLM.DragManager=function() {
}

// Move the dragAvatar over by 2 pixels to prevent overlap with the crosshair cursor and account for any
// scrolling of the page itself.  While we're here, unselect any text that the browser may have mistakenly
// highlighted.
ZLM.DragManager.prototype.constrainDragX=function(mgr, wrapper, intendedX) {
	ZLM.killBrowserSelectionProcess();
	return(intendedX+ZLM.getPageXOffset()+2);
}

// Internal hook for forcing a callback at the end of a drag, successful of not
ZLM.DragManager.endNotify=null;

// Like constrainDragX, we're moving the dragAvatar down by 2 pixels to
// prevent overlap with the  crosshair cursor and adjusting for any page scrolling
ZLM.DragManager.prototype.constrainDragY=function(mgr, wrapper, intendedY) {
	return(intendedY+ZLM.getPageYOffset()+2);
}

// Set up globals for marking the location of the drag's end.  If the operation ended in
// a valid drop zone, call the appropriate drop handler method.  In any case, clean up
// the workspace when we're done.
ZLM.DragManager.prototype.endDrag=function(mgr, wrapper){
	// get the location of the end-of-drag event
	var y=ZLM.getPageOffsetTop(ZLM.dragAvatar);
	var x=ZLM.getPageOffsetLeft(ZLM.dragAvatar);
	// check the list of available drop points to see if the mouse
	// was inside the bounds at the time of the drop
	for (var i=0;i<ZLM.dropDivs.length;i++) {
		var n=ZLM.dropDivs[i];
		var rX = x-ZLM.getPageOffsetLeft(n);
		var rY = y-ZLM.getPageOffsetTop(n);
		if (rX>0 && rY>0 && rX<n.offsetWidth && rY<n.offsetHeight) {
			// drag ended inside a drop point.  Copy to target
			if (n.zenDropHandler) {
				ZLM.dragDest = n;
				ZLM.dragInnerDest=ZLM.findElementAt(n,x,y);
				eval(n.zenDropHandler);
			}
			break;
		}
	}
	// whether a paste happened or not, reset all flags, temp buffers
	// and special event handlers to clear the way for the next drag
	document.body.style.cursor="default";
	ZLM.mouseDown=0;
	ZLM.dragActive=0;
	ZLM.dragSource=null;
	// Order matters, be sure to remove the dragIcon from the active page...
	document.body.removeChild(ZLM.dragAvatar);
	// ... before killing it outright.
	ZLM.dragAvatar=null;
	if (ZLM.DragManager.endNotify) {
		eval(ZLM.DragManager.endNotify);
		ZLM.DragManager.endNotify=null;
	}
}

//================//
// DDD Public API //
//================//

/// Public interface to allow a user defined onDataDrag handler to set the caption string
/// of the object being dragged
ZLM.setDragCaption=function(caption) {
	ZLM.dragCaption=caption;
}

/// Public interface to allows a user defined onDataDrag handler to set the entire drag
/// avatar for a given DDD operation
ZLM.setDragAvatar=function(newDiv) {
	ZLM.dragAvatar=newDiv;
	newDiv.id="zenDragAvatar";
}

/// Public interface to provide the DDD handlers access to the enclosing DIV of the Zen
/// element that initiated the current drag operation
ZLM.getDragSource=function() {
	return(ZLM.dragSource);
}

/// Public interface to provide the DDD handlers access to the inner-most HTML DIV
/// element that initiated the current drag operation (a descendant of the Zen Enclosing Div)
ZLM.getDragInnerSource=function() {
	return(ZLM.dragInnerSource);
}

/// Public interface to provide the DDD handlers access to the enclosing DIV of the Zen
/// element that ended the current drag operation
ZLM.getDragDestination=function() {
	return(ZLM.dragDest);
}

/// Public interface to provide the DDD handlers access to the inner-most HTML DIV
/// element that ended the current drag operation (a descendant of the Zen Enclosing Div)
ZLM.getDragInnerDestination=function() {
	return(ZLM.dragInnerDest);
}

/// Public interface to the actual data descriptor string of the current drag operation
ZLM.getDragData=function() {
	return(ZLM.dragData);
}

/// Public interface to the DOM event that started the current drag operation
ZLM.getDragStartEvent=function() {
	return(ZLM.dragStartEvent);
}
/// Public interface to the DOM event that ended the current drag operation
ZLM.getDragEndEvent=function() {
	return(ZLM.dragEndEvent);
}

//////////////////////////////////////////////////////////////////////////////////////
//                                                                                  //
//                     PPPP   AAA  RRRR  TTTTT    III III III                       //
//                     P   P A   A R   R   T       I   I   I                        //
//                     PPPP  AAAAA RRRR    T       I   I   I                        //
//                     P     A   A R   R   T       I   I   I                        //
//                     P     R   R R   R   T      III III III                       //
//                                                                                  //
//                        DOM tree management stuff                                 //
//                                                                                  //
//////////////////////////////////////////////////////////////////////////////////////

/////////////////
// GLOBAL DATA //
/////////////////

//ZLM.stdErr=null;
ZLM.errWin=null;

////////////////////////////////
// PART III LIBRARY FUNCTIONS //
////////////////////////////////

// Open a second window to serve as an error console and initialize to respect whitespace and use
// a monospaced font.
ZLM.showMsgConsole = function(homeX,homeY) {
	if (ZLM.errWindowPending) return;
	ZLM.errWindowPending = true;
	var f = "width=480,height=200,resizable=yes,scrollbars=yes";
	if (homeX) f+=(",left="+homeX);
	if (homeY) f+=(",top="+homeY);
	ZLM.errWin=window.open("","",f);
	ZLM.errWin.document.title="JavaScript (Non-)Standard Error Stream";
	ZLM.setLocalAttribute(document.body,"onunload","ZLM.closeMsgConsole();");
	var content = "<html><head><title>JavaScript StdErr Stream</title>";
	content+="<script type='text/javascript'>";
	content+="var isReady='okay';";
	content+="function writeln(msg){var d = document.createElement('div');d.appendChild(document.createTextNode(msg));document.body.appendChild(d);}";
	content+="</script> </head>\n";
	content+="<body style='width:100%; height:100%; font-family:monospace; white-space:pre; overflow:auto; background-color:DarkBlue; color:Yellow;' >\n";
	content+="<div>Error Message Console</div>";
	content+="</body></html>";
	ZLM.errWin.document.write(content);
}

ZLM.closeMsgConsole = function() {
	ZLM.errWin.close();
}

/// Output a string to the error console for debugging purposes
ZLM.cerr = function (msg,retry) {
	if (ZLM.errWin==null || ZLM.errWin.closed) {
		if (!ZLM.errWindowPending) ZLM.showMsgConsole(1,0);
		if (!retry) retry=0;
		if (retry>30) {
			ZLM.errWindowPending=false;
			alert("Error window not initializing");
		}
		else {
			setTimeout("ZLM.cerr('"+msg+"',"+(retry+1)+");",100);
		}
	}
	else {
		ZLM.errWindowPending=false;
		ZLM.errWin.writeln(msg);
	}
}

/// Report all known properties of a given object as well as their current values
ZLM.dumpObj = function(obj) {
	for (var prop in obj) {
		ZLM.cerr("Object: "+obj+" name "+prop+" value "+obj[prop]);
	}
}

// Recursive function to dump the nesting structure and base geometry of a tree of DOM nodes
//   node: the root the of the current subtree
//   level: the currnet depth of recursion
//   stem: a string of 0s and 1s used to indicate the location of leaves in the tree already encountered
//   last: a boolean flag used to tell the current node whether or not it is the last child element of its parent
//   pst: parentScrollTop offset
//   psl: parentScrollLeft offset
ZLM.dumpDOMNodeGeometry = function(node,level,stem,last,pst,psl) {
	var printStr="";
	var branchStr="";
	var geoString=" top:"+node.offsetTop+"px left:"+node.offsetLeft+"px";
	if (pst!=0 || psl!=0) geoString+=" sTop:"+(node.offsetTop-pst)+"px sLeft:"+(node.offsetLeft-psl)+"px";
	geoString+=" width:"+node.offsetWidth+"px height:"+node.offsetHeight+"px";
	if (node.scrollTop!=0 || node.scrollLeft!=0) {
		geoString+=" SCROLLED TO: "+node.scrollTop+"|"+node.scrollLeft;
		pst+=node.scrollTop;
		psl+=node.scrollLeft;
	}
	var idStr="ID: "+node.id+"("+node.tagName+":"+node.className+")";
	for(var i=0;i<level;i++) {
		if (i==level-1) {
			if (last) branchStr="*--";
			else branchStr="+--";
		}
		else {
			if (stem.charAt(i+1)=="0") {
				if (ZLM.isIE && i==0) printStr+=".  ";
				else printStr+="   ";
			}
			else printStr+="|  ";
		}
	}
	ZLM.cerr(printStr+"|");
	ZLM.cerr(printStr+branchStr+idStr+" "+geoString);
	var lastKid=null;
	for (var i=node.childNodes.length-1; i>=0;i--) {
		var n=node.childNodes[i];
		if (n.nodeType==1) {
			lastKid=n;
			i= -1;
		}
	}
	if (lastKid==null) return;
	if (last) stem+="0";
	else stem+="1";
	level++;
	if (ZLM.isPositionAnchor(node) || node.tagName=='TABLE') {
		pst-=node.offsetTop;
		psl-=node.offsetLeft;
	}
	for (var i=0;i<node.childNodes.length;i++) {
		var n=node.childNodes[i];
		if (n.nodeType==1) ZLM.dumpDOMNodeGeometry(n,level,stem,n==lastKid,pst,psl);
	}
}

/// Output a text representation of a DOM subtree showing element nesting and basic
/// goemetry parameters starting from the given root node.  To dump the entire DOM
/// to the error console, pass this function document.body as the root.
ZLM.dumpDOMTreeGeometry = function (root) {
	ZLM.dumpDOMNodeGeometry(root,0,"",true,0,0);
}

/// Report all known style properties of a given object as well as their current values
ZLM.dumpElementStyle = function(e) {
	var obj = e["style"];
	for (var prop in obj) {
		ZLM.cerr("Object: "+obj+" name "+prop+" value "+obj[prop]);
	}
}

// Given a function's arguments.callee object as a starting point, send
// a stack trace to the error console
ZLM.traceStack=function(startingPoint) { // starting point should be an arguments.callee of some function
	ZLM.cerr("STACK TRACE:");
	var next = startingPoint;
	var last = null;
	while(next) {
		if(last==next) return;
		ZLM.cerr(ZLM.getFnSignature(next));
		last=next;
		next = next.caller;
	}
	ZLM.cerr("===TOS===");
}

// return the signature of the given function object
ZLM.getFnSignature=function(fn) {
	var sig = ZLM.getFunctionName(fn);
	sig += "(";
	for(var i=0; i<fn.arguments.length; i++) {
		var nextArg = fn.arguments[i];
		if(nextArg.length > 32) nextArg = nextArg.substring(0, 32)+"...";
		sig += "'" + nextArg + "'";
		if(i < fn.arguments.length - 1) sig+=", ";
	}
	sig+=")";
	return(sig);
}

// Under firefox return the current function name, under IE, do the best we can...
ZLM.getFunctionName=function(fn) {
	if(fn.name) return(fn.name);
	var def = fn.toString();
	var name = def.substring(def.indexOf('function')+8,def.indexOf('('));
	if(name) return(name);
	return("IE anonymous");
}

/// Get page X offset to account for horizontal scrolling, in pixels
ZLM.getPageXOffset=function() {
	if (ZLM.isIE) return(document.body.scrollLeft);
	return(window.pageXOffset);
}

/// Get page Y offset to account for vertical scrolling, in pixels
ZLM.getPageYOffset=function() {
	if (ZLM.isIE) return(document.body.scrollTop);
	return(window.pageYOffset);
}

ZLM.pageTopFill=null;

// scan the DOM above the current nodes for element with a vertical fill property
// defined (.fill) with a non-false value
ZLM.isTopFillElement=function(who) {
	if (ZLM.hasPresetWidth(who)) who.fillWide="F"; //set flag for horizontal fill
	if (ZLM.hasPresetHeight(who)) return("F");
	var p=who.parentNode;
	while (p!=null && p!=document.body) {
		if (p.fill && p.fill!="F") return("M"); // fill node higher in tree
		p=p.parentNode;
	}
	// if we're here we must be top dog, should really scan children to turn them
	// off in case they were instantiated first
	if (ZLM.pageTopFill) ZLM.pageTopFill.fill="M";
	ZLM.pageTopFill=who;
	return("T");
}

// get the closest ancestor of a given class or return null if
// such an ancestor does not exist
ZLM.getAncestor=function(node,className) {
	var n=node;
	while (n!=document.body) {
		if (n.className==className) return(n);
		n=n.parentNode;
	}
	return(null);
}

// get the decendant distance between two nodes of a subtree.  Return
// distance as an integer or -1 if the given node is not a member of the
// given subtree
//  root : root of subtree (distance zero)
//  node : node being measured
//
ZLM.getDepth = function(root, node) {
	var i=0;
	var depth = -1;
	if (root==node) return(0);
	if (root.childNodes) {
		while(depth == -1 && i<root.childNodes.length) {
			depth = this.getDepth(root.childNodes[i],node);
			i++;
		}
	}
	if (depth!= -1) depth++;
	return(depth);
}

/// Stop propagation of a given event
ZLM.killEvent=function(event) {
	if (event==null) return;
	if (event.stopPropagation) event.stopPropagation();
	if (event.cancelBubble!=null) event.cancelBubble=true;
	if (event.preventDefault) event.preventDefault();
	else event.returnValue=false;
	return(false);
}

// Probe a couple features to see if it is likely the current browser
// supports html5
ZLM.isHTML5 = function() {
	var val = false;
	var elem = document.createElement("input");
	if ("placeholder" in elem) {
		val = true;
	}
	if (val) {
		if (!(window.HTMLCanvasElement)) val = false;
	}
	return(val);
}

/// Check to see if the page is being viewed under IE
ZLM.isInternetExplorer =function() {
	var who = navigator.appName;
	if (ZLM.isHTML5()) return(false); 
	if (document.documentMode>8) return(false);
	return(who=="Microsoft Internet Explorer");
}

/// Check to see if the page is being viewed via some form of Webkit
ZLM.isWebKit=function() {
	var who=navigator.userAgent;
	return(who.indexOf("WebKit")>=0);
}

/// Check to see if the current page is a Zen page or just HTML
ZLM.isZen = function() {
	return(document.body.id=="zenBody")
}

//////////////////////////
// TREE QUERY FUNCTIONS //
//////////////////////////

// Return the number of child node that are actual element nodes
ZLM.getChildElementCount = function(node) {
	var tally=0;
	for (var i=0;i<node.childNodes.length;i++) {
		if (node.childNodes[i].nodeType==1) tally++;
	}
	return(tally);
}

// Return a pointer the the first child node that is an element node
// or null if the node has no element-type children
ZLM.getFirstElementChild = function(node) {
	for (var i=0;i<node.childNodes.length;i++) {
		if (node.childNodes[i].nodeType==1) return(node.childNodes[i]);
	}
	return(null);
}

// check to see if the given element is a member of a class that begins
// with the given prefix
ZLM.hasClassPrefix = function(element, classPrefix) {
	var whitespace = /\s+/;
	var classes = element.className;
	if (classes==null) return(false);              // no class defined
	if (classes.search==null) return(false);  //no search defined; happens with custom classes
	if (classes.search(classPrefix)==0) return(true);          // exact match
	if (!whitespace.test(classes)) return(false);  // only one class defineed and it's not us
	var substring = classes.split(whitespace);
	for(var i=0;i<substring.length;i++) {
		if (substring[i].search(classPrefix)==0) return(true);   // Found it buried in list
	}
	return(false);  // no joy
}

/// Check to see if the given element is a member of the defined class
ZLM.isClassMember = function(element, className) {
	var whitespace = /\s+/;
	var classes = element.className;
	if (classes==null) return(false);              // no class defined
	if (classes==className) return(true);          // exact match
	if (!whitespace.test(classes)) return(false);  // only one class defineed and it's not us
	var substring = classes.split(whitespace);
	for(var i=0;i<substring.length;i++) {
		if (substring[i]==className) return(true);   // Found it buried in list
	}
	return(false);  // no joy
}

// scan the DOM tree for specific subsets of elements
// if class is null, match any class name
// if tag is null, match any tag name
// if root is null, search from the start of the document onward
ZLM.getDocumentElements = function(className, tag, root) {
	if (root==null) root=document;
	else if (typeof(root)=="string") root = document.getElementById(root);
	if (tag==null) tag = "*";
	var everything = root.getElementsByTagName(tag);
	if (className==null) return(everything);
	var culledList = new Array();
	var count = 0;
	for (var i=0;i<everything.length;i++) {
		var element = everything[i];
		if (this.isClassMember(element,className)) {
			culledList[count]=element;
			count++;
		}
	}
	return(culledList);
}

// scan the DOM tree for specific subsets of elements
// if classPrefix is null, match all DIV elements
// if root is null, search from the start of the document onward
ZLM.getElementsByClassPrefix = function(classPrefix, root, depthStop) {
	if (root==null) root=document.body;
	else if (typeof(root)=="string") root = document.getElementById(root);
	var everything = root.getElementsByTagName("*");
	if (classPrefix==null) return(all);
	var culledList = [];
	var count = 0;
	for (var i=0;i<everything.length;i++) {
		var element = everything[i];
		if (ZLM.hasClassPrefix(element,classPrefix)) {
			if (depthStop==null || this.getDepth(root,everything[i])<depthStop) {
				culledList[count]=element;
          			count++;
			}
		}
	}
	return(culledList);
}

// return a list of nodes whose IDs all begin with a common prefix
ZLM.getElementsByIdPrefix = function(prefix, root, depthStop) {
	var nodes=null;
	var eList = new Array();                // the array of selected elements
	if (root==null) {
		root = document.body;
		nodes = document.body.childNodes;     // the raw list of nodes to search
	}
	else nodes = root.childNodes;
	var baseDepth = this.getDepth(document.body, root);
	var count = 0;
	for (var i=0;i<nodes.length;i++) {
		var s = String(nodes[i].id);          // get ID of current node
		if (s.search(prefix)==0)      {       // if it starts with the prfix, assume it's meant for us
			if (depthStop==null || this.getDepth(root,nodes[i])<depthStop) {
				eList[count]=nodes[i]; // add it to the list
				count++;
			}
		}
	}
	return(eList);
}

ZLM.getNodesAsArray=function(root,a) {
// Recurse through the tree adding each element node visited to the given array
	a.push(root);
	for (var k=root.firstChild;k!=null;k=k.nextSibling) {
		if (k.nodeType==1) ZLM.getNodesAsArray(k,a);
	}
}

ZLM.filterElementsByDefinedAttribute=function(a,attr) {
// Given an array of element pointers and an attributeName,
// Return the subset of the array that have the given attribute defined
	var e = [];
	for (var j=0;j<a.length;j++) {
		var k=a[j];
		if (ZLM.hasAttribute(k,attr)) e.push(k);
	}
	return(e);
}

// Return a list of element below the root node that all have the given
// attributes defined.
ZLM.findElementsByDefinedAttribute=function (root,attrName) {
	// Due to a bug in IE, need to access childNode list as an array
	// (apparently their design team failed Data Structures their sophomore year)
	var kids = [];
	var kMax = root.childNodes.length;
	for (var j=0;j<kMax;j++) {
		var k=root.childNodes[j];
		if (k.nodeType==1) {
			var subKids = ZLM.findElementsByDefinedAttribute(k,attrName);
			for (var i=0;i<subKids.length;i++) kids.push(subKids[i]);
			if (ZLM.hasAttribute(k,attrName)) kids.push(k);
		}
	}
	return(kids);
}

// Given the root of a DOM subtree and a pixel location, return the most deeply
// nested element that contains this location
ZLM.findElementAt=function(root,x,y) {
	for (var k=root.firstChild;k!=null;k=k.nextSibling) {
		if (k.nodeType==1 && k.offsetHeight>0) {
			var baseX = ZLM.getPageOffsetLeft(k);
			var maxX = baseX+k.offsetWidth;
			if (baseX<=x && x<=maxX) {
				var baseY = ZLM.getPageOffsetTop(k);
				var maxY = baseY+k.offsetHeight;
				if (baseY<=y && y<=maxY) {
					return(ZLM.findElementAt(k,x,y));
				}
			}
		}
	}
	return(root);
}

// Return true if the given node has a defined value for the given attribute
ZLM.hasAttribute=function(node,attrName) {
	if (node.attrName) return(true);
	if (ZLM.isIE) {
		var v=node.getAttribute(attrName);
		return(v!=null && v.length>0);
	}
	else return(node.hasAttribute(attrName));
}

// Return the value of a given attribute for a given node.  If the node does
// not have the given attribute defined, set it to the given default value and
// return the default as the current value.
ZLM.initAttribute=function(div,attrName,defaultValue) {
	var val = div.getAttribute(attrName);
	if (val==null || val=="") val=defaultValue;
	return(val);
}

// Unselect any elements the browser may have selected automatically during
// drag operations. NEED MORE RESEARCH FOR CROSS BROWSER OPERATIONS.
ZLM.killBrowserSelectionProcess=function() {
	if (window.getSelection) { // New style
		window.getSelection().removeAllRanges();
	}
	else if (document.getSelection) { // Old Navigator style
	}
	else if (document.selection) { // IE Style
		document.selection.empty();
	}
	else {
	}
}

//==============================//
// Hidden Java Applet Interface //
//==============================//


/// Dynamically load a hidden applet to compensate for features lacking in javascript
/// When called, the code will add a small (1 pixel) applet node to the document body
/// with the given ID and based off of the code (such as "myApplet.class") provided.
/// The system will then initiate a half second poll, attempting to call an applet
/// function called "appletReady()" - which must have been defined for the applet -
/// If this call is successful within a 5 second timeout, the given callback function
/// is invoked to alert the caller that the applet is ready for business.  NOTE: This
/// system was designed to for small helper applets that need to loaded dynamically,
/// NOT as a general replacement to the APPLET, OBJECT and EMBED tags statically available
/// in HTML
ZLM.loadHiddenApplet=function(id,code,callback) {
	var appletTag = ZLM.simulateTag("applet code='"+code+"' id='"+id+"' style='width:1px; height:1px; float:left;'");
	document.body.appendChild(appletTag);
	ZLM.pollApplet(id,callback,0);
}

// Given the DOM Id of a newly loaded dynamic helper applet, poll the object for a
// successful call to a dummy function called "appletReady" (defined within the java class)
// If this call is successful, reduce the pixel footprint of the applet to 0 (this must be
// done AFTER initialization or some browsers will ignore the applet) and call the given
// callback.
ZLM.pollApplet=function(appletId,callback,tryCount) {
	var app = document.getElementById(appletId);
	try {
		app.appletReady();
		app.style.width='0px';
		app.style.height='0px';
		eval(callback);
	} catch(err) {
		if (tryCount<10) setTimeout("pollApplet('"+appletId+"','"+callback+"',"+(tryCount+1)+");",500);
	}
}

////////////////////////////
// NODE BUILDER FUNCTIONS //
////////////////////////////

// Set an internal flag to mark a given dynamic div as ready for processing
ZLM.markAsReady=function(div) {
	var tag=document.createComment("ZenReady");
	div.insertBefore(tag,div.firstChild);
}

// Test to see if a given dynamic div is ready for processing
ZLM.isReady=function(div) {
	var n=div.firstChild;
	if (n==null) return(false);
	if (n.nodeName!="#comment") return(false);
	if (n.nodeValue!="ZenReady") return(false);
	return(true);
}

// Clear white space from either end of a string
ZLM.trim = function(str) {
	while(str.charAt(0)==" ") str=str.substring(1,str.length);
	while(str.length>0 && str.charAt(str.length-1)==" ") str=str.substring(0,str.length-1);
	return(str);
}

// Convert CSS style attributes to JavaScript style variable names
ZLM.dehyphenate = function(str) {
	var Idx = str.indexOf("-");
	while (Idx> -1) {
		var newCase = str.substring(Idx+1,Idx+2).toUpperCase();
		str=str.substring(0,Idx)+newCase+str.substring(Idx+2,str.length);
		Idx = str.indexOf("-");
	}
	return(str);
}

/// Set the given attribute for the given node to the given value.  This
/// compensate for browser idiosyncrancies by dupping out the setAttribute function
/// (which is non-w3c compliant under IE) in favor of a cross platform call
ZLM.setLocalAttribute = function(who, attrName, attrValue) {
	if (!ZLM.isIE) {
		if (navigator.userAgent.indexOf("Trident")>0) eval("who."+attrName+"=attrValue;");
		who.setAttribute(attrName,attrValue);
		if (attrName.search("on")==0) {  // Safety check to ensure callbacks are actually functions
			if (!who[attrName] || (typeof who[attrName] == 'string')) {
				who[attrName] = new Function(attrValue);
			}	
		}
		return;
	}
	else {
		// foible #1:  IE's javascript interpreter can't handle variables or subscripts named 'class'
		// they change the internal property for elements to className
		if (attrName=="class") {
			try { // IE9 wants class but older version barf on it
				who.setAttribute("class",attrValue);
			}
			catch(e) {
			}
			who.setAttribute("className",attrValue);
		}
		else if (attrName=="style") {
			// foible #2: IE stores 'style' as an object (which is fine, so does Firefox), the problem
			// is that setAttribute is _supposed_ to take a string and parse it to set various properties
			// within the style object.  IE's implmentation replaces the style object with the given string
			// and doesn't know what to do with the string afterward, wiping out all style properies (both
			// local and inherited) the fix is to modify the style object directly by parsing the string
			var props = attrValue.split(";");  // get an array of properties to set & the value
			for(var i=0;i<props.length;i++) {
				var pair = props[i].split(":");  // split property name off from its value
				if (pair[0]) {
					var propertyIdx = ZLM.dehyphenate(ZLM.trim(pair[0]));
					var propertyValue = this.trim(pair[1]);
					who.style[propertyIdx]=propertyValue;
				}
			}
		}
		else if (attrName.search("on")==0) {
			// foible #3: IE's event handlers aren't strings, they're anonymous, argumentless, function
			// wrappers AROUND the actual string normally given in the HTML.  If the attribute name starts
			// with "on" we'll assume its an event handler and mock up the appropriate wrappers
			var funcName = new String(attrValue);
			var IHateIE = new Function(funcName.toString());
			who[attrName] = IHateIE;
		}
		else {
			// cross our fingers and pray that it works as specified under IE
			who.setAttribute(attrName,attrValue);
		}
	}
}

/// Build a new node or subtree of the given type
///
///  tagName    : the HTML tag of the new element (div, p, input, etc)
///  attributes : an array indexed by HTML attribute name with default values stored in strings
///  kids       : either a string (if the only child of this node is a text element) or
///               an array of DOM elements
ZLM.makeElement = function(tagName, attributes, kids) {
	var newElement = document.createElement(tagName);
	if (attributes!=null) {
		for(var attrName in attributes) {
			this.setLocalAttribute(newElement,attrName,attributes[attrName]);
		}
	}
	if (kids!=null) {
		if (kids instanceof Array) {
			for (var i=0;i<kids.length;i++) {
				var brat = kids[i];
				if (typeof(brat) == "string" ) brat = document.createTextNode(brat);
				newElement.appendChild(brat);
			}
		}
		else if (typeof(kids)=="string") newElement.appendChild(document.createTextNode(kids));
		else newElement.appendChild(kids);
	}
	return(newElement);
}

/// shorthand function for dynamically creating childless nodes
///   str: an HTML-like tag definition string akin to:
///          "div style='width:50px; height:50px;' onclick='doSomething();'"
ZLM.simulateTag = function(str) {
	if (str==null) return(null);
	var endIdx = str.indexOf(" ");
	if (endIdx== -1) { // no attributes, just use string as tag name
		return(ZLM.makeElement(str,null,null));
	}
	// Okay extract the tag name and start setting attributes
	var startIdx=0;
	var tagName = str.substr(startIdx,endIdx);
	var attr = new Array();
	startIdx=endIdx+1;
	while(startIdx<str.length) {
		endIdx=str.indexOf(" ",startIdx);
		if (endIdx== -1) endIdx=str.length;
		var extractLen = endIdx-startIdx;
		if (extractLen>0) {
			var attrRec = str.substr(startIdx,endIdx-startIdx);
			var attrEnd = str.indexOf("=",startIdx);
			if (attrEnd== -1) {
				ZLM.cerr("ERROR: Bad attribute string ("+attrRec+") in ZLM.simulateTag");
				return(null);
			}
			var attrName = str.substr(startIdx,attrEnd-startIdx);
			attrEnd+=2;  // skip space and openning quote
			var valueEnd = str.indexOf("'",attrEnd);
			if (valueEnd== -1) {
				ZLM.cerr("ERROR: Expected single quotes around value ("+attrRec+") in ZLM.simulateTag");
				return(null);
			}
			var value = str.substr(attrEnd,valueEnd-attrEnd);
			attr[attrName]=value;
			if (valueEnd>endIdx) endIdx=valueEnd;
		}
		startIdx=endIdx+1;
	}
	return(ZLM.makeElement(tagName,attr,null));
}

/// Dynamically add a sound effect inside a hidden <EMBED> tag.  The given name parameter
/// is used as the HTML ID attribute of the resulting tag and should be unique on the page.
/// the given src tag should be the path/filename of a sound file in a support format
/// (e.g. "sounds/beep.wav")
ZLM.installSoundFx = function(name,src) {
	var sndSpan = ZLM.simulateTag("div style='width:0px; height:0px; overflow:hidden;'");
	var tagStr="embed id='"+name+"' src='"+src+"' width='1px' height='1px' autostart='false' loop='false' enablejavascript='true'";
	var embed=ZLM.simulateTag(tagStr);
	sndSpan.appendChild(embed);
	document.body.appendChild(sndSpan);
	ZLM.setSize(embed,0,0,"none");
}

/// Play a previously installed sound effect.  The given name should match the name
/// designated when the sound file was embedded via ZLM.installSoundFx()
ZLM.playSoundFx = function(name) {
	var sndObj = document.getElementById(name);
	sndObj.Play();
}

/// Restructure the DOM by moving the given node to be a child of the given newParent
ZLM.reparent = function(node, newParent) {
	if (node.parentNode==newParent) return;
	if (node.parentNode!=null) node.parentNode.removeChild(node);
	if (newParent!=null) newParent.appendChild(node);
}

//
// reporting sizes of elements is so version and platform dependant that we should isolate
// the process rather than assume that offsetWidth and the various border, margin and padding
// systems will render useful numbers.  This function acts as a one stop train wreck, it won't
// fix the idiosyncracies of goemetry reporting but it will force all screw-ups and potenial
// workrounds to be centally located
//

// Is the given element a potential offsetParent of other nodes
ZLM.isPositionAnchor=function(element) {
	if (element==null) return(1);
	if (element==document.body) return(1);
	if (element.style.position=="absolute") return(1);
	if (element.style.position=="fixed") return(1);
	if (element.style.position=="relative") return(1);
	return(0);
}

/// Calculate the effective "top" value of the given element with respect to its closest
/// absolutely positioned ancestor.  The naming of this function is most unfortunate in that
/// "Absolute" refers to the position attribute of the parent nodes, NOT an absolute frame
/// of reference such as location on the page or in the window.  To get this latter measure
/// use ZLM.getPageOffsetTop()
ZLM.getAbsoluteOffsetTop=function(element) {
	var prev = element.offsetParent;
	if (prev==null) return(element.offsetTop);
	var top = element.offsetTop-prev.scrollTop;
	for (var n=element.parentNode;n!=element.offsetParent;n=n.parentNode) top-=n.scrollTop;
	while (ZLM.isPositionAnchor(prev)==0) {
		var oldP=prev;
		prev=prev.offsetParent;
		top+=(prev.offsetTop-prev.scrollTop);
		for (var n=oldP.parentNode;n!=prev;n=n.parentNode){
			top-=n.scrollTop;
		}
	}
	return(top);
}

/// Calculate the effective "left" value of the given element with respect to its closest
/// absolutely positioned ancestor.  The naming of this function is most unfortunate in that
/// "Absolute" refers to the position attribute of the parent nodes, NOT an absolute frame
/// of reference such as location on the page or in the window.  To get this latter measure
/// use ZLM.getPageOffsetLeft()
ZLM.getAbsoluteOffsetLeft=function(element) {
	var prev = element.offsetParent;
	if (prev==null) return(element.offsetLeft);
	var left = element.offsetLeft-prev.scrollLeft;
	for (var n=element.parentNode;n!=element.offsetParent;n=n.parentNode) left-=n.scrollLeft;
	while (ZLM.isPositionAnchor(prev)==0) {
		var oldP=prev;
		prev=prev.offsetParent;
		left+=(prev.offsetLeft-prev.scrollLeft);
		for (var n=oldP.parentNode;n!=prev;n=n.parentNode) left-=n.scrollLeft;
	}
	return(left);
}

/// Return the effective top coordinate of the given element with respect to the given
/// offsetParent.  The parent node must be an ancestor of the the given node and be a
/// valid position anchor (c.f. ZLM.isPositionAnchor()).  The DOM tree root, document.body,
/// is the highest level frame of reference available and offsets relative to this node
/// will give the absolute position of element within the document itself.
ZLM.getRelativeOffsetTop=function(element,baseFrame) {
	if (element==baseFrame) return(0);
	var top = element.offsetTop;
	var prev = element.offsetParent;
	if (prev==null) return(top); //element not displayed
	for (var n=element.parentNode;n!=prev;n=n.parentNode) top-=n.scrollTop;
	while (prev!=baseFrame && prev!=document.body) {
		var oldP=prev;
		top+=prev.offsetTop-prev.scrollTop;
		prev=prev.offsetParent;
		for (var n=oldP.parentNode;n!=prev;n=n.parentNode) top-=n.scrollTop;
	}
	return(top);
}

/// Return the effective left coordinate of the given element with respect to the given
/// offsetParent.  The parent node must be an ancestor of the the given node and be a
/// valid position anchor (c.f. ZLM.isPositionAnchor()).  The DOM tree root, document.body,
/// is the highest level frame of reference available and offsets relative to this node
/// will give the absolute position of element within the document itself.
ZLM.getRelativeOffsetLeft=function(element,baseFrame) {
	if (element==baseFrame) return(0);
	var left= element.offsetLeft;
	var prev = element.offsetParent;
	if (prev==null) return(left); // element not displayed
	for (var n=element.parentNode;n!=prev;n=n.parentNode) left-=n.scrollLeft;
	while (prev!=baseFrame && prev!=document.body) {
		var oldP=prev;
		left+=prev.offsetLeft-prev.scrollLeft;
		prev=prev.offsetParent;
		for (var n=oldP.parentNode;n!=prev;n=n.parentNode) left-=n.scrollLeft;
	}
	return(left);
}

/// Return the vertical location of the given element with respect to the document
/// as a whole
ZLM.getPageOffsetTop=function(element) {
	return(ZLM.getRelativeOffsetTop(element,document.body));
}

/// Return the horizontal location of the given element with respect to the document
/// as a whole
ZLM.getPageOffsetLeft=function(element) {
	return(ZLM.getRelativeOffsetLeft(element,document.body));
}

/// For any DOM node, query the css styles in effect for that node
ZLM.getComputedNodeStyle=function(node,styleName) {
	if (node.currentStyle) { // IE Style
		return(node.currentStyle[styleName]);
	}
	else { //W3C style
		return(window.getComputedStyle(node,null)[styleName]);
	}
}

/// Get the inside width of an element.  This is defined as the offsetWidth minus the width of the border
/// on the  left and right side.  This is different from the clientWidth in that a) the definition of client
/// width varies between browsers, and b) if the area is scrolled, the width of the scrollbar IS NOT
/// deducted from the total width.
ZLM.getInsideWidth = function(element) {
	var baseW = element.offsetWidth;
	if (element.currentStyle) { // IE specific
		var leftW = parseInt(element.currentStyle.borderLeftWidth);
		var rightW = parseInt(element.currentStyle.borderRightWidth);
	}
	else { // FF and others
		var s=window.getComputedStyle(element,null);
		var leftW = parseInt(s.borderLeftWidth);
		var rightW = parseInt(s.borderRightWidth);
	}
	if (isNaN(leftW)) leftW=0;
	if (isNaN(rightW)) rightW=0;
	var insideW = baseW-leftW-rightW;
	return(insideW);
}

/// Get the inside height of an element.  This is defined as the offsetHeight minus the height of the border
/// on the  top and bottom side.  This is different from the clientHeight in that a) the definition of client
/// height varies between browsers, and b) if the area is scrolled, the height of the scrollbar IS NOT
/// deducted from the total height.
ZLM.getInsideHeight = function(element) {
	var baseW = element.offsetHeight;
	if (element.currentStyle) { // IE specific
		var topW = parseInt(element.currentStyle.borderTopWidth);
		var bottomW = parseInt(element.currentStyle.borderBottomWidth);
	}
	else { // FF and others
		var s=window.getComputedStyle(element,null);
		var topW = parseInt(s.borderTopWidth);
		var bottomW = parseInt(s.borderBottomWidth);
	}
	if (isNaN(topW)) topW=0;
	if (isNaN(bottomW)) bottomW=0;
	var insideW = baseW-topW-bottomW;
	return(insideW);
}

/// Return the default size (width for verical, height for horizontal) of a scrollbar for the 
/// current browser
ZLM.getScrollbarSize = function() {
	if (ZLM.defaultScrollbarSize) return(ZLM.defaultScrollbarSize);
	var d = document.createElement("div");
	var s = d.style;
	s.position = "absolute";
	s.display = "block";
	s.padding = "0px";
	s.overflow = "scroll";
	s.width = "100px";
	s.height = "100px";
	document.body.appendChild(d);
	ZLM.defaultScrollbarSize = 100-d.clientHeight;
	document.body.removeChild(d);
	return(ZLM.defaultScrollbarSize);
}

/// Try our best to get the client width of an element.  Normally this is taken care of
/// by the browser, but only if the element is currently visible.  In the case where we 
/// want to predict what the client width is likely to be when a hidden element BECOMES 
/// visible we need to be a bit trickier.  In the non-visible case, this method only works
/// if applicable CSS rules were specified in pixels.
ZLM.getClientWidth = function(element) {
	if (element.clientWidth && element.clientWidth>0) {
		element.zenLastClientWidth = element.clientWidth;
		return(element.clientWidth);
	}
	var w = element.offsetWidth;
	if  (w>0) {
		var sw = parseInt(element.style.width,10);
		if (sw===0 || element.style.display=="none") return(0); // really _was_ set to zero

		if (ZLM.isIE) {
			if (element.currentStyle.borderStyle!="none") {
				var bW = parseInt(element.currentStyle.borderWidth);
				if (bW) w = w+2*bW;
			}
		}
		element.zenLastClientWidth = w;
		return(w);
	}
	// element is not visible - perhaps we asked for this value before
	if (element.zenLastClientWidth) return(element.zenLastClientWidth);
	// No joy, probably caught in the middle of a server side refresh do it
	// the hard way and hope that all CSS values were in pixels...
	w = parseInt(ZLM.getComputedNodeStyle(element,"width"),10);
	var pl = parseInt(ZLM.getComputedNodeStyle(element,"padding-left"),10);
	if (pl) w+=pl;
	var pr = parseInt(ZLM.getComputedNodeStyle(element,"padding-right"),10);
	if (pr) w+=pr;
	element.zenLastClientWidth = w;
	return(w);
}

/// Try our best to get the client height of an element.  Normally this is taken care of
/// by the browser, but only if the element is currently visible.  In the case where we 
/// want to predict what the client height is likely to be when a hidden element BECOMES 
/// visible we need to be a bit trickier.  In the non-visible case, this method only works
/// if applicable CSS rules were specified in pixels.
ZLM.getClientHeight = function(element) {
	if (element.clientHeight && element.clientHeight>0) {
		element.zenLastClientHeight = element.clientHeight;
		return(element.clientHeight);
	}
	var h = element.offsetHeight;
	if  (h>0) {
		var sh = parseInt(element.style.height,10);
		if (sh===0 || element.style.display=="none") return(0); // really _was_ set to zero

		if (ZLM.isIE) {
			if (element.currentStyle.borderStyle!="none") {
				var bW = parseInt(element.currentStyle.borderWidth);
				if (bW) h = h+2*bW;
			}
		}
		element.zenLastClientHeight = h;
		return(h);
	}
	// element is not visible - perhaps we asked for this value before
	if (element.zenLastClientHeight) return(element.zenLastClientHeight);
	// No joy, probably caught in the middle of a server side refresh do it
	// the hard way and hope that all CSS values were in pixels...
	h = parseInt(ZLM.getComputedNodeStyle(element,"height"),10);
	var pt = parseInt(ZLM.getComputedNodeStyle(element,"padding-top"),10);
	if (pt) h+=pt;
	var pb = parseInt(ZLM.getComputedNodeStyle(element,"padding-bottom"),10);
	if (pb) h+=pb;
	element.zenLastClientHeight = h;
	return(h);
}

/// Try our best to get the offset width of an element.  Normally this is taken care of
/// by the browser, but only if the element is currently visible.  In the case where we 
/// want to predict what the offset width is likely to be when a hidden element BECOMES 
/// visible we need to be a bit trickier.  In the non-visible case, this method only works
/// if applicable CSS rules were specified in pixels.
ZLM.getOffsetWidth = function(element) {
	var w = element.offsetWidth;
	if  (w>0) {
		var sw = parseInt(element.style.width,10);
		if (sw===0 || element.style.display=="none") return(0); // really _was_ set to zero
		element.zenLastOffsetWidth = w;
		return(w);
	}
	// element is not visible - perhaps we asked for this value before
	if (element.zenLastOffsetWidth) return(element.zenLastOffsetWidth);
	// No joy, probably caught in the middle of a server side refresh do it
	// the hard way and hope that all CSS values were in pixels...
	w = parseInt(ZLM.getComputedNodeStyle(element,"width"),10);
	var bl = parseInt(ZLM.getComputedNodeStyle(element,"border-left"),10);
	if (bl) w+=bl;
	var pl = parseInt(ZLM.getComputedNodeStyle(element,"padding-left"),10);
	if (pl) w+=pl;
	var br = parseInt(ZLM.getComputedNodeStyle(element,"border-right"),10);
	if (br) w+=br;
	var pr = parseInt(ZLM.getComputedNodeStyle(element,"padding-right"),10);
	if (pr) w+=pr;
	element.zenLastOffsetWidth = w;
	return(w);
}

/// Try our best to get the offset height of an element.  Normally this is taken care of
/// by the browser, but only if the element is currently visible.  In the case where we 
/// want to predict what the offset height is likely to be when a hidden element BECOMES 
/// visible we need to be a bit trickier.  In the non-visible case, this method only works
/// if applicable CSS rules were specified in pixels.
ZLM.getOffsetHeight = function(element) {
	var h = element.offsetHeight;
	if  (h>0) {
		var sh = parseInt(element.style.height,10);
		if (sh===0 || element.style.display=="none") return(0); // really _was_ set to zero
		element.zenLastOffsetHeight = h;
		return(h);
	}
	// element is not visible - perhaps we asked for this value before
	if (element.zenLastOffsetHeight) return(element.zenLastOffsetHeight);
	// No joy, probably caught in the middle of a server side refresh do it
	// the hard way and hope that all CSS values were in pixels...
	h = parseInt(ZLM.getComputedNodeStyle(element,"height"),10);
	var bt = parseInt(ZLM.getComputedNodeStyle(element,"border-top"),10);
	if (bt) h+=bt;
	var pt = parseInt(ZLM.getComputedNodeStyle(element,"padding-top"),10);
	if (pt) h+=pt;
	var bb = parseInt(ZLM.getComputedNodeStyle(element,"border-bottom"),10);
	if (bb) h+=bb;
	var pb = parseInt(ZLM.getComputedNodeStyle(element,"padding-bottom"),10);
	if (pb) h+=pb;
	element.zenLastOffsetHeight = h;
	return(h);
}

/// Set the offset width of the given element despite IE's bounding box problem
/// and various version dependencies on the bound box calulations
ZLM.setOffsetWidth = function(element,width) {
	if (element.offsetWidth>0) { // object is visible
		element.style.width=width+"px";
		var delta = element.offsetWidth-width;
		var newSize = width-delta;
		if (newSize<1) newSize=1;
		element.style.width= newSize+"px";
	}
	else { // need to do this the hard way and hope everything was specified in pixels
		try {
			var delta = 0;
			var bl = parseInt(ZLM.getComputedNodeStyle(element,"border-left"),10);
			if (bl) delta+=bl;
			var pl = parseInt(ZLM.getComputedNodeStyle(element,"padding-left"),10);
			if (pl) delta+=pl;
			var br = parseInt(ZLM.getComputedNodeStyle(element,"border-right"),10);
			if (br) delta+=br;
			var pr = parseInt(ZLM.getComputedNodeStyle(element,"padding-right"),10);
			if (pr) delta+=pr;
			element.style.width = (width-delta)+"px";
		}
		catch(e) {
			element.style.width = width+"px";
		}
	}
}

/// Set the offset height of the given element despite IE's bounding box problem
/// and various version dependencies on the bound box calulations
ZLM.setOffsetHeight = function(element,height) {
	if (element.offsetHeight>0) { // object is visible
		element.style.height=height+"px";
		var delta = element.offsetHeight-height;
		var newSize = height-delta;
		if (newSize<1) newSize=1;
		element.style.height= newSize+"px";
	}
	else { // need to do this the hard way and hope everything was specified in pixels
		try {
			var delta = 0;
			var bt = parseInt(ZLM.getComputedNodeStyle(element,"border-top"),10);
			if (bt) delta+=bt;
			var pt = parseInt(ZLM.getComputedNodeStyle(element,"padding-top"),10);
			if (pt) delta+=pt;
			var bb = parseInt(ZLM.getComputedNodeStyle(element,"border-bottom"),10);
			if (bb) delta+=bb;
			var pb = parseInt(ZLM.getComputedNodeStyle(element,"padding-bottom"),10);
			if (pb) delta+=pb;
			element.style.height = (height-delta)+"px";
		}
		catch(e) {
			element.style.height = height+"px";
		}
	}
}

/// Get the current layering depth (css:z-index) of an element
ZLM.getDepth=function(element) {
	if (element.currentStyle) { // IE specific
		var d = parseInt(element.currentStyle.zIndex);
	}
	else { // FF and others
		var s=window.getComputedStyle(element,null);
		var d = parseInt(s.zIndex);
	}
	if (isNaN(d)) d=0;
	return(d);
}

// INCORRECTLY calculate the border width of the given element
ZLM.getEdgeWidth = function(element) {
	return((element.offsetWidth-element.clientWidth)/2);
}

// INCORRECTLY calculate the border height of the given element
ZLM.getEdgeHeight = function(element) {
	return((element.offsetHeight-element.clientHeight)/2);
}

/// Set the position of a given absolutely positioned element (e) to the given location (x,y)
ZLM.setPosition=function(e,x,y) {
	e.style.top=y+"px";
	e.style.left=x+"px";
}


/// Set the width of the given element to the given value, while attemping to
/// compensate for the IE bounding box problem
ZLM.setWidth=function(e,width) {
	if (typeof(width)=="string" && width.indexOf("%")>0) var adjW=false;
	else var adjW=true;
	if (adjW) {
		if (typeof(width)=="string") width=parseInt(width);
		if (width<0) width=0;
	}
	var bW=0;
	if (ZLM.isIE) {
		if (e.currentStyle==null) bW=0;
		else {
			var bWStr=e.currentStyle.borderWidth;
			if (bWStr==null) bw=0;
			else if (bWStr=="medium") bW=2;
			else bW = parseInt(bWStr);
		}
		if (adjW) width+=2*bW;
	}
	if (adjW) width=width+"px";
	e.style.width=width;
}

/// Set the height of the given element to the given value, while attemping to
/// compensate for the IE bounding box problem
ZLM.setHeight=function(e,height) {
	if (typeof(height)=="string" && height.indexOf("%")>0) var adjH=false;
	else var adjH=true;
	if (adjH) {
		if (typeof(height)=="string") height=parseInt(height);
		if (height<0) height=0;
	}
	var bW=0;
	if (ZLM.isIE) {
		if (e.currentStyle==null) bW=0;
		else {
			var bWStr=e.currentStyle.borderWidth;
			if (bWStr==null) bw=0;
			else if (bWStr=="medium") bW=2;
			else bW = parseInt(bWStr);
		}
	}
	if (adjH) {
		height+=2*bW;
		if (height<16) {
			e.style.fontSize="0px";
			e.style.lineHeight="0px";
			e.style.overflow="hidden";
		}
		height=height+"px";
	}
	e.style.height=height;
}

/// Set the width height and border style for the given element in a
/// platform independent fashion that circumvents IE's incompatibilities
/// with CSS.  Certain border rendering styles will still vary according to
/// which brower is in use, but the base geometry of the elements will be
/// the same across platforms and browser versions
ZLM.setSize=function(e,width,height,borderStr) {
	if (isNaN(width)) return;
	if (isNaN(height)) return;
	if (typeof(width)=="string" && width.indexOf("%")>0) var adjW=false;
	else var adjW=true;
	if (typeof(height)=="string" && height.indexOf("%")>0) var adjH=false;
	else var adjH=true;
	if (adjW) {
		if (typeof(width)=="string") width=parseInt(width);
		if (width<0) width=0;
	}
	if (adjH) {
		if (typeof(height)=="string") height=parseInt(height);
		if (height<0) height=0;
	}
	var bW=0;
	if (ZLM.isIE) {
		if (borderStr) {
			if (borderStr=="none") e.style.border="0px solid red";
			else {
				e.style.border=borderStr;
				bW=parseInt(borderStr);
			}
		}
		else {
			if (e.currentStyle==null) bW=0;
			else {
				var bWStr=e.currentStyle.borderWidth;
				if (bWStr==null) bw=0;
				else if (bWStr=="medium") bW=2;
				else bW = parseInt(bWStr);
			}
		}
		if (adjW) width+=2*bW;
		if (adjH) {
			height+=2*bW;
			if (height<6) {
				if (ZLM.isIE && !e.zenFontSize) {
					e.zenFontSize=e.currentStyle.fontSize;
					e.zenLineHeight=e.currentStyle.lineHeight;
					e.zenOverflow=e.currentStyle.overflow;
				}
				e.style.fontSize="0px";
				e.style.lineHeight="0px";
				e.style.overflow="hidden";
			}
			else {
				if (ZLM.isIE && e.zenFontSize) {
					e.style.fontSize=e.zenFontSize;
					e.style.lineHeight=e.zenLineHeight;
					e.style.overflow=e.zenOverflow;
					e.zenFontSize=null;
					e.zenLineHeight=null;
					e.zenOverflow=null;
				}
			}
		}
	}
	else {
		if (borderStr) e.style.border=borderStr;
	}
	if (adjH) height=height+"px";
	if (adjW) width=width+"px";
	e.style.width=width;
	e.style.height=height;
}

/// return the size of the viewport height
ZLM.getViewportHeight=function() {
	if (window.innerHeight) return(window.innerHeight); // non-IE
	if (document.documentElement && document.documentElement.clientHeight) return(document.documentElement.clientHeight);
	return(document.body.clientHeight);
}

/// return the size of the viewport height
ZLM.getViewportWidth=function() {
	if (window.innerWidth) return(window.innerWidth); // non-IE
	if (document.documentElement && document.documentElement.clientWidth) return(document.documentElement.clientWidth);
	return(document.body.clientWidth);
}

/// return virtual height of a rendered document
ZLM.getDocumentHeight=function() {
	if (ZLM.isIE){
		// return the max extent of the children of root as
		// the value stored in document.body.scrollHeight (the former return value)
		// can't be trusted (another IE bug)
		var max=0;
		for (var i=0;i<document.body.childNodes.length;i++) {
			var n=document.body.childNodes[i];
			if (n.nodeType==1) {
				var extY=n.offsetTop+n.offsetHeight;
				if (extY>max) max=extY;
			}
		}
		return(max);
	}
	return(document.body.offsetHeight);
}

/// return virtual width of a rendered document
ZLM.getDocumentWidth=function() {
	if (ZLM.isIE) return(document.body.scrollWidth);
	return(document.body.offsetWidth);
}

/// We define peer elements to be those that compete for space within the
/// a common parent container element (usually a DOM DIV element.  Under
/// HTML, peer elements are siblings, but under Zen, all low-level
/// elements have DIV wrappers so the peer objects are actually cousins.
/// getPeerList() checks for this condition and returns an array of those
/// DOM nodes which that satisfy the "peer" relationship.  If a given node
/// has no peers, the length of the array returned will be zero.
ZLM.getPeerList=function(node) {
	var peers = [];
	if (!ZLM.isZen()) {
		for (var k=node.parentNode.firstChild; k!=null; k=k.nextSibling) {
			if (k.nodeType==1 && k!=node) peers[peers.length]=k;
		}
		return(peers);
	}
	// if we're here, we need to account for Zen wrapper Divs
	var realRoot=node.parentNode.parentNode;
	for (var p=realRoot.firstChild;p!=null;p=p.nextSibling) {
		if (p.nodeType==1 && p!=node.parentNode) {
			for (var k=p.firstChild;k!=null;k=k.nextSibling) {
				if (k.nodeType==1) peers[peers.length]=k;
			}
		}
	}
	return(peers);
}

/// Given an array of peer node, total up the the combined offset Height
ZLM.getPeerHeight=function(peers) {
	var h=0;
	for (var i=0;i<peers.length;i++) {
		h+=peers[i].offsetHeight;
	}
	return(h);
}

// find the ancestor of the given node that is a direct child of the
// main document body
ZLM.getOriginalAncestor=function(who) {
	var p = who.parentNode;
	if (p==document.body) return(who);
	if (p==null) return(null);
	return(ZLM.getOriginalAncestor(p));
}

// Default page layouts under Zen often include a blank filler row.  This
// conflicts with the autoFill elements that would like to expand to fill
// empty space on the page.  The solution is to find the filler and account
// for its space to find out how much room there really is for the actual
// content rows to expand.
ZLM.findEmptyTableRow=function(tBody) {
	var fillerRow=null;
	for (var i=tBody.childNodes.length-1;i>=0;i--) {
		var n=tBody.childNodes[i];
		if (n.nodeType==1 && n.tagName=="TR") {
			if (n.childNodes.length==1 && n.firstChild.childNodes.length==0) return(n);
		}
	}
	return(null);
}

//
ZLM.autoFillZenDivIE=function(who) {
	var p = who.parentNode;
	if (p.parentNode.tagName=="TD") { //stuck in a table
		var thisRow = p.parentNode.parentNode;
		var tableBody=thisRow.parentNode;
		if (!who.zenTFill) who.zenTFill=ZLM.findEmptyTableRow(tableBody);
		var vpH=ZLM.getViewportHeight();
		var tbH=tableBody.offsetHeight;
		var rowH=ZLM.getInsideHeight(thisRow);
		if (who.zenTFill) var fillH=who.zenTFill.offsetHeight;
		else var fillH=0;
		var peerH=tbH-rowH-fillH;
		var newH=vpH-peerH;
		p.parentNode.height=newH;
		p.style.height=newH+"px";
 		var maxX=p.clientWidth;
	}
	else { // no table constrictions

/* THE PROBLEM HERE IS
that if the grand-children of <body> have a height of 100% but are
separated from <body> with an unspecified height then IE collapses them to
nothing.  In reality, if the height is blank and the current style height is
auto and the kids are 100% the height should be 100%
need logic to that effect... 
*/
		if (ZLM.isZen()) {
			var body = document.body;
			var zen1 = null;
			var len = body.childNodes.length;
			for (var idx=0;(idx<len)&&(zen1==null);idx++) {
				var k = body.childNodes[idx];
				if (k.zen=="1") zen1=k;
			}
			if (zen1) {
				if (zen1.style.height=="" && zen1.currentStyle.height=="auto") zen1.style.height="100%";
			}
		}
		var maxX=ZLM.getInsideWidth(p);
		var maxY=ZLM.getInsideHeight(p);
		// For the Zen case just worry about the relationship between
		// the active element and it's wrapper
		var minY = 0;
		if (!ZLM.isZen()) minY = ZLM.getPeerHeight(ZLM.getPeerList(who));
		var newH = maxY-minY;
	}
	if (who.fillWide=="F") var newW=who.clientWidth;
	else var newW = maxX-who.offsetLeft;
	ZLM.setSize(who, newW, newH,"none");
}

// Address the specialty case of a top level fill element under both Zen and Firefox
ZLM.autoFillZenDivFF=function(who) {
	var p = who.parentNode;
	if (p.parentNode.tagName=="TD") { //stuck in a table
		var thisRow = p.parentNode.parentNode;
		var tableBody=thisRow.parentNode;
		if (!who.zenTFill) who.zenTFill=ZLM.findEmptyTableRow(tableBody);
		var vpH=ZLM.getViewportHeight();
		var tbH=tableBody.offsetHeight;
		var rowH=ZLM.getInsideHeight(thisRow);
		if (who.zenTFill) var fillH=who.zenTFill.offsetHeight;
		else var fillH=0;
		var peerH=tbH-rowH-fillH;
		var newH=vpH-peerH;
		p.parentNode.height=newH;
		p.style.height=newH+"px";
 		var maxX=p.clientWidth;
	}
	else { // no table constrictions
		var maxX=ZLM.getInsideWidth(p);
		var maxY=ZLM.getInsideHeight(p);
		// For the Zen case just worry about the relationship between
		// the active element and it's wrapper
		var minY = 0;
		if (!ZLM.isZen()) minY = ZLM.getPeerHeight(ZLM.getPeerList(who));
		var newH = maxY-minY;
	}
	if (who.fillWide=="F") var newW=who.clientWidth;
	else var newW = maxX-who.offsetLeft;
	ZLM.setSize(who, newW, newH,"none");
}

/// Given a borderless DIV element that has been set to autofill available space, query
/// the current page geometry and set the DIV's sizing accordingly.  Note that to
/// work under Internet Explorer the div overflow style should be set to "hidden"
/// prior to this function call.
ZLM.sizeAutoFillDiv=function(who) {
	if (who.fill=="T") {
		if (ZLM.isZen()) {
			if (ZLM.isIE) {
				ZLM.autoFillZenDivIE(who);
				return;
			}
			else { //Firefox variations
				ZLM.autoFillZenDivFF(who);
				return;
			}
		}
		else { // HTML framework
			var maxX = ZLM.getViewportWidth();
			var maxY = ZLM.getViewportHeight();
			var minY = ZLM.getDocumentHeight();
			if (ZLM.isIE) var newH = who.offsetHeight+maxY-minY;
			else var newH = who.clientHeight+maxY-minY;
		}
	}
	else if (who.fill=="M") {
		var p = who.parentNode;
		var maxX=ZLM.getInsideWidth(p);
		var maxY=ZLM.getInsideHeight(p);
		if (ZLM.isZen()&&ZLM.isIE) maxY = p.parentNode.offsetHeight;
		var minY = ZLM.getPeerHeight(ZLM.getPeerList(who));
		var newH = maxY-minY;
	}
	else return; // fixed space, don't react to resize
	if (who.fillWide=="F") var newW=who.clientWidth;
	else var newW = maxX-who.offsetLeft;
	ZLM.setSize(who, newW, newH,"none");
}

//====================
// Stylesheet Handling
//====================

/// Given the index of a stylesheet in the DOM styleSheet Array, wrap it
/// in a cross platform access object
ZLM.CSSPool = function(ssIdx) {
	this.ss=document.styleSheets[ssIdx];
	if (this.ss.cssRules) this.rules=this.ss.cssRules;
	else this.rules=this.ss.rules;
}

/// Return the a given rule of a stylesheet by index number
ZLM.CSSPool.prototype.getRule=function(idx) {
	if (this.rules && idx<this.rules.length) return(this.rules[idx]);
	return(null);
}

/// Return the higest priority rule matching the given selector
ZLM.CSSPool.prototype.getActiveRule=function(select) {
	if (this.rules==null) return(null);
	select=select.toLowerCase();
	for (var i=this.rules.length-1;i>=0;i--) {
		if (this.rules[i].selectorText.toLowerCase()==select) return(this.rules[i]);
	}
	return(null);
}

/// Dump the given stylesheet (idenified by HTML index number) to the error console
ZLM.dumpStyleSheet=function(idx) {
	var s=new ZLM.CSSPool(idx);
	for (var i=0;i<s.rules.length;i++) {
		ZLM.cerr(s.rules[i].selectorText+" { "+s.rules[i].style.cssText+" }");
	}
}

/// Dump all defined stylesheets to the error console
ZLM.dumpCSS=function() {
	for(var i=0;i<document.styleSheets.length;i++) {
		ZLM.cerr("STYLE SHEET "+i+":");
		ZLM.dumpStyleSheet(i);
	}
}

/// Scan the document for rules pertaining to a particular ID
/// Although most browsers allow duplicate IDs (against W3C recommendations)
/// this search is case sensitive and stops with the first applicable rule found.
ZLM.getCSSRuleById=function(id) {
	id="#"+id;
	for(var i=document.styleSheets.length-1;i>=0;i--) {
		var s=new ZLM.CSSPool(i);
		for (var j=s.rules.length-1;j>=0;j--) {
			var sText = s.rules[j].selectorText;
			if (sText && sText.indexOf(id)>=0) return(s.rules[j]);
		}
	}
}

/// Scan the document (by order of precidence) for all rules pertaining to the
/// given class
ZLM.getCSSRulesByClass=function(className,rules) {
	className="."+className;
	for(var i=document.styleSheets.length-1;i>=0;i--) {
		var s=new ZLM.CSSPool(i);
		for (var j=s.rules.length-1;j>=0;j--) {
			var sText = s.rules[j].selectorText;
			if (sText && sText.indexOf(className)>=0) {
				rules[rules.length]=s.rules[j];
			}
		}
	}
}

/// Scan the object itself as well as any defined stylesheets for rules
/// pertaining to the style of the object.
ZLM.getAproposCSSRules=function(node) {
	var r = new Array();
	r[0]=new Object();
	r[0].selectorText="this";
	r[0].style=node.style;
	var idRule=null;
	if (node.id!=null) idRule=ZLM.getCSSRuleById(node.id);
	if (idRule!=null) r[1]=idRule;
	ZLM.getCSSRulesByClass(node.className,r);
	return(r);
}

/// Test to see if the given element has a preset height specified either
/// at the element level or via a stylesheet
ZLM.hasPresetHeight=function(node) {
	var r=ZLM.getAproposCSSRules(node);
	var h=null;
	for (var i=0;i<r.length;i++) {
		h=r[i].style.height;
		if (h!=null && h!="" && h!="100%") return(true);
	}
	return(false);
}

/// Test to see if the given element has a preset height specified either
/// at the element level or via a stylesheet
ZLM.hasPresetWidth=function(node) {
	var r=ZLM.getAproposCSSRules(node);
	var w=null;
	for (var i=0;i<r.length;i++) {
		w=r[i].style.width;
		if (w!=null && w!="" && w!="100%") return(true);
	}
	return(false);
}

//=================
// FONT HANDLING
//=================
  ZLM.activeFontList = null;
  ZLM.serverFontFile = "/csp/broker/zenFontList.rc";

// Get the width and height of the given string as if it were rendered as a child
// of the given context
ZLM.getStringExtents=function(str,context) {
	var div = ZLM.simulateTag("div style='display:inline;'");
	var txt = document.createTextNode(str);
	div.appendChild(txt);
	context.appendChild(div);
	var width=div.offsetWidth;
	var height=div.offsetHeight;
	var extent=width+"X"+height;
	context.removeChild(div);
	return(extent);
}

/// Return the width of the given string when rendered in the given font
/// and font size on the current system
ZLM.getStringPixelWidth=function(str,font,fontSz) {
	var div = document.createElement("DIV");
	var sp = document.createElement("SPAN");
	div.appendChild(sp);
	sp.style.fontFamily=font;
	sp.style.fontSize=fontSz;
	sp.innerHTML=str;
	document.body.appendChild(div);
	var width=sp.offsetWidth;
	document.body.removeChild(div);
	return(width);
}

/// Return the height of the given string when rendered in the given font
/// and font size on the current system
ZLM.getStringPixelHeight=function(str,font,fontSz) {
	var div = document.createElement("DIV");
	var sp = document.createElement("SPAN");
	div.appendChild(sp);
	sp.style.fontFamily=font;
	sp.style.fontSize=fontSz;
	sp.innerHTML=str;
	document.body.appendChild(div);
	var height=sp.offsetHeight;
	document.body.removeChild(div);
	return(height);
}

// Create a font dector object to assist in detecting the presence (or absence) of
// specific fonts on a specific system
ZLM.FontDetector=function() {
	var div = document.createElement("DIV");
	var sp = document.createElement("SPAN");
	div.appendChild(sp);
	div.style.fontFamily="sans-serif";
	sp.style.fontFamily="sans-serif";
	sp.style.fontSize="72px";
	sp.innerHTML="wwwwwwwwwwwwwwl";
	document.body.appendChild(div);
	var baseWidth=sp.offsetWidth;
	var baseHeight=sp.offsetHeight;
	document.body.removeChild(div);

	function test(font) {
		document.body.appendChild(div);
		sp.style.fontFamily=font;
		var w=sp.offsetWidth;
		var h=sp.offsetHeight;
		document.body.removeChild(div);
		if (w!=baseWidth || h!=baseHeight) return(true);
		font = font.toLowerCase();
		if (font=="arial" || font=="sans-serif") return(true);
		// Could still be false negative but...
		return(false);
	}
	this.test = test;
}

// Given an array of font names to test, check for the existence of each font on
// the given system and place the names of all available fonts in the comma separated
// ZLM.activeFontList
ZLM.testFontArray=function(fontArray) {
	var csl = null;
	var t=new ZLM.FontDetector();
	for (var i=0;i<fontArray.length;i++) {
		if (t.test(fontArray[i])) {
			if (csl==null) csl=fontArray[i];
			else csl+=","+fontArray[i];
		}
	}
	ZLM.activeFontList=csl;
}

// Given a text file of font names, extract the names into an array and test each entry
// in the array for existence on the current system
ZLM.processFontListFile=function(fonts) {
	if (fonts==null) return;
	fonts=fonts.replace(/\r/g,"");
	var fla=fonts.split("\n");
	ZLM.testFontArray(fla);
}

/// Return a comma separated list of all available fonts on the current system that could
/// be automatically detected.  Detection methods vary with browsers and security settings
/// the list returned may not be comprehensive.  To increase the likelihood that a given font
/// is detected properly, edit the server file csp/broker/zenFontList.rc to explicitly add
/// the name of the desired font to the list of fonts to be tested
ZLM.getAvailableFonts = function() {
	if (ZLM.activeFontList==null) {
		try {
			var fla = java.awt.GraphicsEnvironment.getLocalGraphicsEnvironment().getAvailableFontFamilyNames();
			var fl=fla[0];
			var trip = /\d/;
			for (var i=1;i<fla.length;i++) {
				if (!trip.test(fla[i])) {
					fl+=",";
					fl+=fla[i];
				}
			}
			ZLM.activeFontList=fl;
		} catch(e) { // direct query via java failed see if there's a server to offer suggestions
			ZLM.httpSyncGetText(ZLM.serverFontFile,ZLM.processFontListFile);
			if (ZLM.activeFontList==null) {  // that didn't work either
				// return most popular fonts under IE
				var dList="Arial,Arial Black,Arial Narrow,Book Antiqua,Bookman Old Style,Century Gothic,Comic Sans MS,Courier New,Franklin Gothic Medium,Georgia,Impact,Lucida Console,Lucida Sans Unicode,Microsoft Sans Serif,Monotype Corsiva,Palantino Linotype,Sylfaen,Tahoma,Times New Roman,Trebuchet MS,Verdana,Wingdings";
				ZLM.testFontArray(dList.split(","));
			}
		}
	}
	return(ZLM.activeFontList);
}

////////////////////////////////////////////////////////////////////////////////////
//                                                                                //
//                     PPPP   AAA  RRRR  TTTTT    III V   V                       //
//                     P   P A   A R   R   T       I  V   V                       //
//                     PPPP  AAAAA RRRR    T       I   V V                        //
//                     P     A   A R   R   T       I   V V                        //
//                     P     R   R R   R   T      III   V                         //
//                                                                                //
//                           Color management stuff                               //
//                                                                                //
////////////////////////////////////////////////////////////////////////////////////

/////////////////
// GLOBAL DATA //
/////////////////

ZLM.namedColor = {};

ZLM.namedColor.aliceblue="240,248,255";
ZLM.namedColor.antiquewhite="250,235,215";
ZLM.namedColor.aqua="0,255,255";
ZLM.namedColor.aquamarine="127,255,212";
ZLM.namedColor.azure="240,255,255";
ZLM.namedColor.beige="245,245,220";
ZLM.namedColor.bisque="255,228,196";
ZLM.namedColor.black="0,0,0";
ZLM.namedColor.blanchedalmond="255,235,205";
ZLM.namedColor.blue="0,0,255";
ZLM.namedColor.blueviolet="138,43,226";
ZLM.namedColor.brown="165,42,42";
ZLM.namedColor.burlywood="222,184,135";
ZLM.namedColor.cadetblue="95,158,160";
ZLM.namedColor.chartreuse="127,255,0";
ZLM.namedColor.chocolate="210,105,30";
ZLM.namedColor.coral="255,127,80";
ZLM.namedColor.cornflowerblue="100,149,237";
ZLM.namedColor.cornsilk="255,248,220";
ZLM.namedColor.crimson="220,20,60";
ZLM.namedColor.cyan="0,255,255";
ZLM.namedColor.darkblue="0,0,139";
ZLM.namedColor.darkcyan="0,139,139";
ZLM.namedColor.darkgoldenrod="184,134,11";
ZLM.namedColor.darkgray="169,169,169";
ZLM.namedColor.darkgrey="169,169,169";
ZLM.namedColor.darkgreen="0,100,0";
ZLM.namedColor.darkkhaki="189,183,107";
ZLM.namedColor.darkmagenta="139,0,139";
ZLM.namedColor.darkolivegreen="85,107,47";
ZLM.namedColor.darkorange="255,140,0";
ZLM.namedColor.darkorchid="153,50,204";
ZLM.namedColor.darkred="139,0,0";
ZLM.namedColor.darksalmon="233,150,122";
ZLM.namedColor.darkseagreen="143,188,143";
ZLM.namedColor.darkslateblue="72,61,139";
ZLM.namedColor.darkslategray=="47,79,79";
ZLM.namedColor.darkslategrey="47,79,79";
ZLM.namedColor.darkturquoise="0,206,209";
ZLM.namedColor.darkviolet="148,0,211";
ZLM.namedColor.deeppink="255,20,147";
ZLM.namedColor.deepskyblue="0,191,255";
ZLM.namedColor.dimgray="105,105,105";
ZLM.namedColor.dimgrey="105,105,105";
ZLM.namedColor.dodgerblue="30,144,255";
ZLM.namedColor.firebrick="178,34,34";
ZLM.namedColor.floralwhite="255,250,240";
ZLM.namedColor.forestgreen="34,139,34";
ZLM.namedColor.fuchsia="255,0,255";
ZLM.namedColor.gainsboro="220,220,220";
ZLM.namedColor.ghostwhite="248,248,255";
ZLM.namedColor.gold="255,215,0";
ZLM.namedColor.goldenrod="218,165,32";
ZLM.namedColor.gray="128,128,128";
ZLM.namedColor.grey="128,128,128";
ZLM.namedColor.green="0,128,0";
ZLM.namedColor.greenyellow="173,255,47";
ZLM.namedColor.honeydew="240,255,240";
ZLM.namedColor.hotpink="255,105,180";
ZLM.namedColor.indianred=="205,92,92";
ZLM.namedColor.indigo="75,0,130";
ZLM.namedColor.ivory="255,255,240";
ZLM.namedColor.khaki="240,230,140";
ZLM.namedColor.lavender="230,230,250";
ZLM.namedColor.lavenderblush="255,240,245";
ZLM.namedColor.lawngreen="124,252,0";
ZLM.namedColor.lemonchiffon="255,250,205";
ZLM.namedColor.lightblue="173,216,230";
ZLM.namedColor.lightcoral="240,128,128";
ZLM.namedColor.lightcyan="224,255,255";
ZLM.namedColor.lightgoldenrodyellow="250,250,210";
ZLM.namedColor.lightgray="211,211,211";
ZLM.namedColor.lightgrey="211,211,211";
ZLM.namedColor.lightgreen="144,238,144";
ZLM.namedColor.lightpink="255,182,193";
ZLM.namedColor.lightsalmon="255,160,122";
ZLM.namedColor.lightseagreen="32,178,170";
ZLM.namedColor.lightskyblue="135,206,250";
ZLM.namedColor.lightslategray="119,136,153";
ZLM.namedColor.lightslategrey="119,136,153";
ZLM.namedColor.lightsteelblue="176,196,222";
ZLM.namedColor.lightyellow="255,255,224";
ZLM.namedColor.lime="0,255,0";
ZLM.namedColor.limegreen="50,205,50";
ZLM.namedColor.linen="250,240,230";
ZLM.namedColor.magenta="255,0,255";
ZLM.namedColor.maroon="128,0,0";
ZLM.namedColor.mediumaquamarine="102,205,170";
ZLM.namedColor.mediumblue="0,0,205";
ZLM.namedColor.mediumorchid="186,85,211";
ZLM.namedColor.mediumpurple="147,112,216";
ZLM.namedColor.mediumseagreen="60,179,113";
ZLM.namedColor.mediumslateblue="123,104,238";
ZLM.namedColor.mediumspringgreen="0,250,154";
ZLM.namedColor.mediumturquoise="72,209,204";
ZLM.namedColor.mediumvioletred="199,21,133";
ZLM.namedColor.midnightblue="25,25,112";
ZLM.namedColor.mintcream="245,255,250";
ZLM.namedColor.mistyrose="255,228,225";
ZLM.namedColor.moccasin="255,228,181";
ZLM.namedColor.navajowhite="255,222,173";
ZLM.namedColor.navy="0,0,128";
ZLM.namedColor.oldlace="253,245,230";
ZLM.namedColor.olive="128,128,0";
ZLM.namedColor.olivedrab="107,142,35";
ZLM.namedColor.orange="255,165,0";
ZLM.namedColor.orangered="255,69,0";
ZLM.namedColor.orchid="218,112,214";
ZLM.namedColor.palegoldenrod="238,232,170";
ZLM.namedColor.palegreen="152,251,152";
ZLM.namedColor.paleturquoise="175,238,238";
ZLM.namedColor.palevioletred="216,112,147";
ZLM.namedColor.papayawhip="255,239,213";
ZLM.namedColor.peachpuff="255,218,185";
ZLM.namedColor.peru="205,133,63";
ZLM.namedColor.pink="255,192,203";
ZLM.namedColor.plum="221,160,221";
ZLM.namedColor.powderblue="176,224,230";
ZLM.namedColor.purple="128,0,128";
ZLM.namedColor.red="255,0,0";
ZLM.namedColor.rosybrown="188,143,143";
ZLM.namedColor.royalblue="65,105,225";
ZLM.namedColor.saddlebrown="139,69,19";
ZLM.namedColor.salmon="250,128,114";
ZLM.namedColor.sandybrown="244,164,96";
ZLM.namedColor.seagreen="46,139,87";
ZLM.namedColor.seashell="255,245,238";
ZLM.namedColor.sienna="160,82,45";
ZLM.namedColor.silver="192,192,192";
ZLM.namedColor.skyblue="135,206,235";
ZLM.namedColor.slateblue="106,90,205";
ZLM.namedColor.slategray="112,128,144";
ZLM.namedColor.slategrey="112,128,144";
ZLM.namedColor.snow="255,250,250";
ZLM.namedColor.springgreen="0,255,127";
ZLM.namedColor.steelblue="70,130,180";
ZLM.namedColor.tan="210,180,140";
ZLM.namedColor.teal="0,128,128";
ZLM.namedColor.thistle="216,191,216";
ZLM.namedColor.tomato="255,99,71";
ZLM.namedColor.turquoise="64,224,208";
ZLM.namedColor.violet="238,130,238";
ZLM.namedColor.wheat="245,222,179";
ZLM.namedColor.white="255,255,255";
ZLM.namedColor.whitesmoke="245,245,245";
ZLM.namedColor.yellow="255,255,0";
ZLM.namedColor.yellowgreen="154,205,50";

// Given a hex digit, return its decimal value
ZLM.parseHexDigit=function(c) {
	if (c=="0") return(0);
	if (c=="1") return(1);
	if (c=="2") return(2);
	if (c=="3") return(3);
	if (c=="4") return(4);
	if (c=="5") return(5);
	if (c=="6") return(6);
	if (c=="7") return(7);
	if (c=="8") return(8);
	if (c=="9") return(9);
	if (c=="a" || c=="A") return(10);
	if (c=="b" || c=="B") return(11);
	if (c=="c" || c=="C") return(12);
	if (c=="d" || c=="D") return(13);
	if (c=="e" || c=="E") return(14);
	if (c=="f" || c=="F") return(15);
	return("BAD DIGIT");
}

// Given a decimal value from 0-15 return its Hex digit equivalent
ZLM.toHexDigit=function(dd) {
	if (dd==0) return("0");
	if (dd==1) return("1");
	if (dd==2) return("2");
	if (dd==3) return("3");
	if (dd==4) return("4");
	if (dd==5) return("5");
	if (dd==6) return("6");
	if (dd==7) return("7");
	if (dd==8) return("8");
	if (dd==9) return("9");
	if (dd==10) return("a");
	if (dd==11) return("b");
	if (dd==12) return("c");
	if (dd==13) return("d");
	if (dd==14) return("e");
	if (dd==15) return("f");
	return(null);
}

// Given an arbitrary decimal value and the number of places desired in the
// Hexadecimal representation, return the equivalent hex string of appropriate length
ZLM.toHexString=function(value,length) {
	var places=0;
	var hStr = "";
	while (value>0) {
		var d = Math.floor(value/16);
		value -= (d*16);
		hStr+=ZLM.toHexDigit(d);
		places++;
		if (value<16) {
			hStr+=ZLM.toHexDigit(value);
			places++;
			value=0;
		}
	}
	var rStr="";
	while (places<length) {
		rStr+="0";
		places++;
	}
	rStr+=hStr;
	return(rStr);
}

/// given a hex color string of the form #xxxxxx, convert it to a comma separated list of
/// rgb values in decimal.  If the input string is in any way invalid, return null
ZLM.convertHexColorString=function(hexStr) {
	if (hexStr.charAt(0)!='#') return(null);
	if (hexStr.length>4) {
		var redVal=ZLM.parseHexDigit(hexStr.charAt(1))*16+ZLM.parseHexDigit(hexStr.charAt(2));
		if (redVal>=0 && redVal<=255) {
			var greenVal=ZLM.parseHexDigit(hexStr.charAt(3))*16+ZLM.parseHexDigit(hexStr.charAt(4));
			if (greenVal>=0 && greenVal<=255) {
				var blueVal=ZLM.parseHexDigit(hexStr.charAt(5))*16+ZLM.parseHexDigit(hexStr.charAt(6));
				if (blueVal>=0 && blueVal<=255) return(redVal+","+greenVal+","+blueVal);
			}
		}
	} else {
		var redVal=ZLM.parseHexDigit(hexStr.charAt(1))*16-1; 
    	if (redVal>=0 && redVal<=255) { 
      		var greenVal=ZLM.parseHexDigit(hexStr.charAt(2))*16-1; 
      		if (greenVal>=0 && greenVal<=255) { 
        		var blueVal=ZLM.parseHexDigit(hexStr.charAt(3))*16-1; 
        		if (blueVal>=0 && blueVal<=255) 
					return(redVal+","+greenVal+","+blueVal); 
      		} 
    	} 
	}
	return(null);
}

/// given an RGB color specification string of the form rgb(dd,dd,dd) reduce it to
/// a simple comma separated list of RGB values
ZLM.convertRGBColorString=function(rgbStr) {
	if (rgbStr.indexOf("rgb(")!=0) return(null);
	return(rgbStr.slice(4,rgbStr.length-1));
}

/// given an RGB color specification string of the form rgba(dd,dd,dd,o) reduce it to
/// an array [dd,dd,dd,o] JSL4485
ZLM.convertRGBAColorString=function(rgbaStr) {
	var lcClrStr = rgbaStr.toLowerCase();
	if (lcClrStr.indexOf("rgba(")!=0) return(null);
	return(lcClrStr.slice(5,lcClrStr.length-1).split(','));
}

/// Given a W3C standard web color name, return a CSL of the associated RGB values
ZLM.convertNamedColorString=function(nameStr) {
	if (ZLM.namedColor[nameStr]) return(ZLM.namedColor[nameStr]);
	return(null);
}

ZLM.convertColorToRGB=function(color) {
	var lcClrStr = color.toLowerCase();
	var byRGB = ZLM.convertRGBColorString(lcClrStr);
	if (byRGB) return(byRGB);
	var byName = ZLM.convertNamedColorString(lcClrStr);
	if (byName) return(byName);
	return(ZLM.convertHexColorString(lcClrStr));
}

ZLM.convertColorToRGBA=function(color, opacity) {
	// JSL4485
	opacity = typeof(opacity) != 'undefined' ? opacity : 1;
	var rgbString = ZLM.convertColorToRGB(color);
	if (rgbString) {
		return rgbString + ',' + opacity;
	}
	var a = ZLM.convertRGBAColorString(color);
	if (a) {
		return a.slice(0,3).join(',')+','+(parseFloat(a[3])*parseFloat(opacity));
	}
	return null;
	
}

/// Return the foreground color of a given node as an RGB string
ZLM.getRGBColor = function(node) {
	if (node.currentStyle) // IE Style
		var clrStr = node.currentStyle.color;
	else if (window.getComputedStyle) // W3C Style
		var clrStr = window.getComputedStyle(node,null).color;
	else return(null);
	var lcClrStr = clrStr.toLowerCase();
	var byRGB = ZLM.convertRGBColorString(lcClrStr);
	if (byRGB) return(byRGB);
	var byName = ZLM.convertNamedColorString(lcClrStr);
	if (byName) return(byName);
	return(ZLM.convertHexColorString(lcClrStr));
}

/// Return the background color of a given node as an RGB string
ZLM.getRGBBackgroundColor = function(node) {
	if (node.currentStyle) // IE Style
		var clrStr = node.currentStyle.backgroundColor;
	else if (window.getComputedStyle) // W3C Style
		var clrStr = window.getComputedStyle(node,null).backgroundColor;
	else return(null);
	var lcClrStr = clrStr.toLowerCase();
	var byRGB = ZLM.convertRGBColorString(lcClrStr);
	if (byRGB) return(byRGB);
	var byName = ZLM.convertNamedColorString(lcClrStr);
	if (byName) return(byName);
	return(ZLM.convertHexColorString(lcClrStr));
}

/// Return the CSS spcified background color of a given class as a CSL RGB string
ZLM.getCSSBackgroundDefault=function(classname,context) {
	var div = ZLM.simulateTag("div class='"+classname+"'");
	context.appendChild(div);
	var color=ZLM.getRGBBackgroundColor(div);
	context.removeChild(div);
	return(color);
}

/// Return the CSS spcified foreground color of a given class as a CSL RGB string
ZLM.getCSSForegroundDefault=function(classname,context) {
	var div = ZLM.simulateTag("div class='"+classname+"'");
	context.appendChild(div);
	var color=ZLM.getRGBColor(div);
	context.removeChild(div);
	return(color);
}

/// Return 1 if the gray-scale reduction of a given RGB color is of less
/// that 50% intensity, otherwise return 0
ZLM.isDarkRGB=function(rgbColor) {
	var c=rgbColor.split(",");
	var y=Math.floor(0.3*parseInt(c[0])+0.59*parseInt(c[1])+0.11*parseInt(c[2]));
	if (y<127) {
		return(1);
	}
	return(0);
}

/// Given a color (in one of several formats) return a string of the form
/// "#rrggbb" in hex digits suitable for embedding in HTML code
ZLM.toHTMLColorSpec=function(color) {
	if (color==null || color.length==0) return("#FF0000");
	var lcColor = color.toLowerCase();
	if (ZLM.convertHexColorString(lcColor)!=null) return(lcColor);
	var csvRGB = ZLM.convertRGBColorString(lcColor);
	if (csvRGB==null) {
		csvRGB = ZLM.convertNamedColorString(lcColor);
		if (csvRGB==null) csvRGB=lcColor;
	}
	var c=csvRGB.split(",");
	var str="#"+ZLM.toHexString(c[0],2)+ZLM.toHexString(c[1],2)+ZLM.toHexString(c[2],2);
	return(str);
}

/// Given two colors in RGB format, return a color string that represents an equal
/// blending of the two shades
ZLM.averageColor=function(csvRGB1,csvRGB2) {
	var c1=csvRGB1.split(",");
	var c2=csvRGB2.split(",");
	var r = (parseInt(c1[0])+parseInt(c2[0]))>>1;
	var g = (parseInt(c1[1])+parseInt(c2[1]))>>1;
	var b = (parseInt(c1[2])+parseInt(c2[2]))>>1;
	return(r+","+g+","+b);
}

/// Given a color in RGB format return a light hue of the same basic tone
ZLM.lightenColor=function(csvRGB) {
	var c=csvRGB.split(",");
	var r=parseInt(c[0]);
	var g=parseInt(c[1]);
	var b=parseInt(c[2]);
	var diff = 256;
	if (r<255 && 255-r<diff) diff=255-r;
	if (g<255 && 255-g<diff) diff=255-g;
	if (b<255 && 255-b<diff) diff=255-b;
	diff = diff>>1;
	if (r<255) r+=diff;
	if (g<255) g+=diff;
	if (b<255) b+=diff;
	return(r+","+g+","+b);
}

/////////////////////////////////////////////////////////////////////////////////
//                                                                             //
//                     PPPP   AAA  RRRR  TTTTT     V   V                       //
//                     P   P A   A R   R   T       V   V                       //
//                     PPPP  AAAAA RRRR    T        V V                        //
//                     P     A   A R   R   T        V V                        //
//                     P     R   R R   R   T         V                         //
//                                                                             //
//                       keyboard management stuff                             //
//                                                                             //
/////////////////////////////////////////////////////////////////////////////////

/////////////////
// GLOBAL DATA //
/////////////////
ZLM.kdbInitialized = 0;
ZLM.quickKey = new Array();
ZLM.quickKeyFn = new Array();
ZLM.quickKeyCtx = new Array();
ZLM.keyContext = new Array();
ZLM.eventPending = false;

/// Push a new context filter onto the keyboard service stack
ZLM.pushKeyContext=function(str) {
	ZLM.keyContext.push(str);
}

/// Remove the top context from the keyboard service stack
ZLM.popKeyContext=function(name) {
	var s = name;
	if (name) { // remove named context regardless of stacking order
		var l = ZLM.keyContext.length;
		var lm1 = l-1;
		var found = false;
		for (var i=0;i<l;i++) {
			if (ZLM.keyContext[i]==name) found = true;
			if (found && i<lm1) ZLM.keyContext[i]=ZLM.keyContext[i+1];
		}
		if (found) ZLM.keyContext.pop();
	}
	else { // just pop the last one pushed
		s = ZLM.keyContext.pop();
	}
}

ZLM.getFilteredContext=function(context) {
	for(var i=0;i<ZLM.quickKeyCtx.length;i++) {
		if (ZLM.quickKeyCtx[i]==context) {
			if (typeof ZLM.quickKey[i]=="object" ) return(i);
		}
	}
	return(-1);
}

ZLM.registerShortCut=function(key,func,context) {
	ZLM.quickKey.push(key);
	ZLM.quickKeyFn.push(func);
	ZLM.quickKeyCtx.push(context);
}

ZLM.registerKeyFilter=function(keys,func,context) {
	var kA = keys.split(",");
	for (var i=0;i<kA.length;i++) if (kA[i]=="comma") kA[i]=",";
	var idx = ZLM.getFilteredContext(context);
	if (idx<0) idx=ZLM.quickKey.length;
	ZLM.quickKey[idx]=kA;
	ZLM.quickKeyFn[idx]=func;
	ZLM.quickKeyCtx[idx]=context;
}

ZLM.ctrlCode = {
  8:"backspace", 9:"tab", 13:"return", 19:"pause", 27:"escape", 32:"space",
  33:"pageup", 34:"pagedown", 35:"end", 36:"home", 37:"left", 38:"up", 39:"right",
  40:"down", 44:"printscreen", 45:"insert", 46:"delete", 112:"f1", 113:"f2", 114:"f3",
  115:"f4", 116:"f5", 117:"f6", 118:"f7", 119:"f8", 120:"f9", 121:"f10", 122:"f11",
  123:"f12", 144:"numlock", 145:"scrolllock" };

ZLM.printCode = {
  48:"0", 49:"1", 50:"2", 51:"3", 52:"4", 53:"5", 54:"6", 55:"7", 56:"8", 57:"9",
  59:";", 61:"=", 65:"a", 66:"b", 67:"c", 68:"d", 69:"e", 70:"f", 71:"g", 72:"h",
  73:"i", 74:"j", 75:"k", 76:"l", 77:"m", 78:"n", 79:"o", 80:"p", 81:"q", 82:"r",
  83:"s", 84:"t", 85:"u", 86:"v", 87:"w", 88:"x", 89:"y", 90:"z", 107:"=", 109:"-",
  110:".", 188:",", 190:".", 191:"/", 192:"`", 219:"[", 220:"\\", 221:"]", 222:"'" };

ZLM.KeysAlpha="a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u,v,w,x,y,z";
ZLM.KeysNumericRaw="0,1,2,3,4,5,6,7,8,9";
ZLM.KeysWhiteSpace="tab,return,space";
ZLM.KeysPunctuation="`,~,!,@,#,$,%,^,&,*,(,),-,_,=,+,{,[,},],:,;,|,\\,',\",.,comma,<,>,/,?";
ZLM.KeysControlEdit="backspace,insert,delete";
ZLM.KeysControlNavigate="pageup,pagedown,end,home,left,up,right,down";
ZLM.KeysControlMisc="pause,escape,printscreen,numlock,scrolllock";
ZLM.KeysControlFunc="f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12";

ZLM.KeysNumericMath=ZLM.KeysNumericRaw+",.,+,-";
ZLM.KeysAlphaNumeric=ZLM.KeysAlpha+","+ZLM.KeysNumericRaw;
ZLM.KeysPrintable=ZLM.KeysAlphaNumeric+","+ZLM.KeysWhiteSpace+","+ZLM.KeysPunctuation;
ZLM.KeysControl=ZLM.KeysControlEdit+","+ZLM.KeysControlNavigate+","+ZLM.KeysControlMisc+","+ZLM.KeysControlFunc;
ZLM.KeysAll=ZLM.KeysPrintable+","+ZLM.KeysControl;

ZLM.KeysEditorReserve = [ "ctrl-left", "ctrl-right", "ctrl-up", "ctrl-down", "end", "home",
	"ctrl-a", "shift-right", "shift-left", "shift-down", "shift-up", "shift-home", "shift-end",
	"ctrl-shift-right", "ctrl-shift-left", "ctrl-shift-down", "ctrl-shift-up", "ctrl-shift-home", "ctrl-shift-end",
	"ctrl-x", "shift-delete", "ctrl-c", "ctrl-insert", "ctrl-v", "shift-insert", "ctrl-z", "ctrl-y",
	"ctrl-delete", "ctrl-backspace" ];

ZLM.KeysUSMappedPunctuation = {
	48:")", 49:"!", 50:"@", 51:"#", 52:"$", 53:"%", 54:"^", 55:"&", 56:"*", 57:"(", 59:":",
	61:"+", 107:"+", 109:"_", 110:">", 188:"<", 190:">", 191:"?", 192:"~", 219:"{", 220:"|", 221:"}", 222:"\"" };

// Given a key event, return the qualified name of the keystroke
ZLM.getKeystrokeName=function(e) {
	var mods = "";
	var keyName = null;
	var code = e.keyCode;
	if (code==16||code==17||code==18) return(null); // handle modifiers separately
	keyName=ZLM.ctrlCode[code];
	if (!keyName) keyName=ZLM.printCode[code];
	if (keyName) {
		if (e.altKey) mods += "alt-";
		if (e.ctrlKey) mods += "ctrl-";
		if (e.shiftKey) mods += "shift-";
	}
	else {
		return(null);
	}
	if (mods=="shift-") {
		var aliasKey=ZLM.KeysUSMappedPunctuation[code];
		if (aliasKey) return(aliasKey);
	}
	return(mods+keyName);
}

// Given the full name of a keystroke, return the base (un-modified) key name
ZLM.trimKeyName=function(fullName) {
	if (fullName==null) return(null);
	var idx=fullName.lastIndexOf("-")+1;
	if (idx>=fullName.length) return("-");
	return(fullName.substring(idx));
}

ZLM.passKeystroke=function(flag,event) {
	if (flag) {
		if (ZLM.isZen()&&event.type=="keydown") {
			// ADD ANY SPECIAL HANDLING HERE
		}
		return(true);
	}
	else {
		return(ZLM.killEvent(event));
	}
}

// Filter to check if the focus current belongs to a text entry box and if the
// the given char code should be assumed to be consumed by the browser's editor
ZLM.isTextBoxControlChar=function(node,stroke) {
	var t=node.tagName;
	var filter=false;
	if (t=='TEXTAREA') filter=true;
	else if (t=='INPUT') {
		var tp=node.type;
		if (tp=='text'||tp=='password') filter=true;
	}
	if (!filter) return(false);
	for (var i=0;i<ZLM.KeysEditorReserve.length;i++) {
		if (stroke==ZLM.KeysEditorReserve[i]) return(true);
	}
	return(false);
}

ZLM.serviceKeyboardGecko=function(event) {
	var e = event;
	var fullCode=ZLM.getKeystrokeName(e);
	if (fullCode==null) return(ZLM.passKeystroke(true,e));
	var keyName=ZLM.trimKeyName(fullCode);

	if (ZLM.isTextBoxControlChar(e.target,fullCode)) return;
	for (var j=ZLM.keyContext.length-1;j>=0;j--) {
		for (var i=0;i<ZLM.quickKey.length;i++) {
			if (ZLM.quickKeyCtx[i]==ZLM.keyContext[j]) {
				if (typeof ZLM.quickKey[i]=="object" ){
					var keys = ZLM.quickKey[i];
					for (var l=0;l<keys.length && keys[l]!=keyName;l++);
					if (l<keys.length) {
						if (eval(ZLM.quickKeyFn[i])==true) {
							return(ZLM.passKeystroke(false,e));
						}
					}
				}
				else if (fullCode==ZLM.quickKey[i]) {
					ZLM.eventPending=false;
					eval(ZLM.quickKeyFn[i]);
					return(ZLM.passKeystroke(false,e));
				}
			}
		}
	}
	ZLM.eventPending=true;
	return(ZLM.passKeystroke(true,e));
}

ZLM.serviceKeyboardIE=function(event) {
	var e = event||window.event;
	var fullCode=ZLM.getKeystrokeName(e);
	if (fullCode==null) return(ZLM.passKeystroke(true,e));
	var keyName=ZLM.trimKeyName(fullCode);

	if (ZLM.isTextBoxControlChar(e.srcElement,fullCode)) return;

	for (var j=ZLM.keyContext.length-1;j>=0;j--) {
		for (var i=0;i<ZLM.quickKey.length;i++) {
			if (ZLM.quickKeyCtx[i]==ZLM.keyContext[j]) {
				if (typeof ZLM.quickKey[i]=="object" ){
					var keys = ZLM.quickKey[i];
					for (var l=0;l<keys.length && keys[l]!=keyName;l++);
					if (l<keys.length) {
						if (eval(ZLM.quickKeyFn[i])==true) {
							return(ZLM.passKeystroke(false,e));
						}
					}
				}
				else if (fullCode==ZLM.quickKey[i]) {
					ZLM.eventPending=false;
					eval(ZLM.quickKeyFn[i]);
					return(ZLM.passKeystroke(false,e));
				}
			}
		}
	}
	ZLM.eventPending=true;
	return(ZLM.passKeystroke(true,e));
}

ZLM.serviceKeyboardWebKit=function(event) {
// WebKit doesn't give separate events for the key modifiers, they embed booleans right in the
// event object.  Need to query custom fields of the keyboard event object

	var e = event||window.event;
	var fullCode=ZLM.getKeystrokeName(e);
	if (fullCode==null) return(ZLM.passKeystroke(true,e));
	var keyName=ZLM.trimKeyName(fullCode);

	if (ZLM.isTextBoxControlChar(e.target,fullCode)) return;

	for (var j=ZLM.keyContext.length-1;j>=0;j--) {
		for (var i=0;i<ZLM.quickKey.length;i++) {
			if (ZLM.quickKeyCtx[i]==ZLM.keyContext[j]) {
				if (typeof ZLM.quickKey[i]=="object" ){
					var keys = ZLM.quickKey[i];
					for (var l=0;l<keys.length && keys[l]!=keyName;l++);
					if (l<keys.length) {
						if (eval(ZLM.quickKeyFn[i])==true) {
							return(ZLM.passKeystroke(false,e));
						}
					}
				}
				else if (fullCode==ZLM.quickKey[i]) {
					ZLM.eventPending=false;
					eval(ZLM.quickKeyFn[i]);
					return(ZLM.passKeystroke(false,e));
				}
			}
		}
	}
	ZLM.eventPending=true;
	return(ZLM.passKeystroke(true,e));
}

ZLM.monitorKeyboard=function(event) {
	var e=event||window.event;
	ZLM.cerr("saw event :"+e.type +" ("+e.which+"|"+e.keyCode+")");
}

ZLM.initKeyboardHandler=function() {
	if (ZLM.kbdInitialized==1) return;
	if (ZLM.isIE) {
		document.onkeydown=new Function("return(ZLM.serviceKeyboardIE(event));");
		//Took out keypress monitoring to simplify handling
		//document.onkeypress=new Function("return(ZLM.serviceKeyboardIE(event));");
	}
	else {
		if (ZLM.isWebKit()) { // Need Safari-specific handler to deal with lack of keypress events
			window.onkeydown=ZLM.serviceKeyboardWebKit;
		}
		else {  // Firefox model
			window.onkeydown=ZLM.serviceKeyboardGecko;
		}
	}
	window.focus();
	ZLM.kbdInitialized=1;
}


//=========================
// HTTP Low Level controls
//=========================

ZLM._httpFactories = [
	function(){return new XMLHttpRequest(); },
	function(){return new ActiveXObject("Msxml2.XMLHTTP"); },
	function(){return new ActiveXObject("Microsoft.XMLHTTP"); }
];

ZLM._httpFactory=null;

ZLM.httpNewRequest = function() {
	if (ZLM._httpFactory!=null) return(ZLM._httpFactory());
	for (var i=0; i<ZLM._httpFactories.length;i++) {
		try {
			var f = ZLM._httpFactories[i];
			var request=f();
			if (request!=null) {
				ZLM._httpFactory=f;
				return(request);
			}
		} catch(e) {
			continue;
		}
	}
	ZLM._httpFactory=function() {
		ZLM.cerr("Unable to isolate HTTP request factory");
	}
	ZLM._httpFactory();
}

ZLM.httpSyncGetText=function(url,callback,errorCB,cbArg) {
	var r=ZLM.httpNewRequest();
	try {
		r.open("GET",url,false);
		r.send(null);
		if (r.status==200) callback(r.responseText,cbArg);
		else {
			if (errorCB) errorCB(r.status,r.statusText,r,cbArg);
			else callback(null,cbArg);
		}
	} catch(e) {
		if (errorCB) errorCB(-1,"No web server detected",r,cbArg);
		else callback(null,cbArg);
	}
}

ZLM.httpGetText=function(url,callback,errorCB) {
	var r=ZLM.httpNewRequest();
	r.onreadystatechange = function() {
		if (r.readyState==4) {
			if (r.status==200) callback(r.responseText);
			else {
				if (errorCB) errorCB(r.status,r.reponseText,r);
				else callback(null);
			}
		}
	}
	r.open("GET",url);
	r.send(null);
}

ZLM.httpParseHeaders = function(request) {
	var hText = request.getAllResponseHeaders();
	var head = {};
	var ls = /^\s*/;
	var ts = /\s*$/;
	var line = hText.split("\n");
	for (var i=0;i<line.length;i++) {
		var l=line[i];
		if (l.length==0) continue;
		var pos = l.indexOf(":");
		var name = l.substring(0,pos).replace(ls,"").replace(ts,"");
		var val = l.substring(pos+1).replace(ls,"").replace(ts,"");
		head[name]=val;
	}
	return(head);
}

ZLM.httpGetHeaders=function(url,callback,errorCB) {
	var r=ZLM.httpNewRequest();
	r.onreadystatechange=function() {
		if (r.readyState==4) {
			if (r.status==200) callback(ZLM.httpParseHeaders(r));
			else {
				if (errorCB) errorCB(r.status,r.reponseText);
				else callback(null);
			}
		}
	}
	r.open("HEAD",url);
	r.send(null);
}

ZLM.httpGetResponse=function(request) {
	switch(request.getResponseHeader("Content-Type")) {
		case "text/xml": return(request.responseXML);
		case "text/javascript":
		case "application/javascript":
		case "application/x-javascript": return(eval(request.responseText));
		default: return(request.responseText);
	}
}

ZLM.httpPost = function(url, msg, callback, errorCB) {
	var r = ZLM.httpNewRequest();
	r.onreadystatechange=function() {
		if (r.readyState==4) {
			if (r.status==200) callback(ZLM.httpGetResponse(r));
			else {
				if (errorCB) errorCB(r.status,r.reponseText);
				else callback(null);
			}
		}
	}
	r.open("POST",url);
	r.setRequestHeader("Content-Type","text/plain");
	r.send(msg);
}

//=========================//
// Low Level JSON Support  //
//=========================//
ZLM.cloneJSObj = function(o) {
	var newObj = {};
	for (var p in o) newObj[p]=o[p];
	return(newObj);
}

ZLM.jsonIsWhiteSpace=function(c) {
	if (c==' ') return(true);
	if (c=='\n') return(true);
	if (c=='\r') return(true);
	if (c=='\t') return(true);
	return(false);
}

ZLM.jsonSkipWhitespace=function(s) {
	var i=0;
	var l=s.length;
	while(i<l && ZLM.jsonIsWhiteSpace(s.charAt(i))) i++;
	if (i>0) s=s.substring(i);
	return(s);
}

ZLM.jsonTypeOf=function(obj) {
	var t = typeof(obj);
	if (t!="object") return(t);
	if (obj==null) return("null");
	if (!obj.length) return(t);
	if (obj.toUpperCase) return("string");
	return("array");
}

ZLM.jsonQuoteString=function(obj) {
	var s = obj.split('"');
	s = s.join('\\"');
	s = s.split("'");
	s = s.join("\\'");
	return(s);
}

ZLM.jsonUnquoteString=function(obj) {
	var s = obj.split("\\'");
	s = s.join("'");
	s = s.split('\\"');
	s = s.join('"');
	return(s);
}

ZLM.jsonUndelimitString=function(str) {
	var c = str.charAt(0);
	if (!(c=="'" || c=='"')) return(str);
	var s = str.split(c);
	return(s[1]);
}

ZLM.jsonEncode=function(obj,spq) {
	var t = ZLM.jsonTypeOf(obj);
	var s = [];
	switch(t) {
		case 'object':
			s.push('{');
			var clean=true;
			for (p in obj) {
				clean=false;
				if (spq) s.push(p+':');
				else s.push('"'+p+'":');
				s.push(ZLM.jsonEncode(obj[p]));
				s.push(',');
			}
			if (!clean) s.pop();
			s.push('}');
			break;
		case 'array':
			s.push('[');
			var l = obj.length;
			for (var i=0;i<l;i++) {
				s.push(ZLM.jsonEncode(obj[i]));
				s.push(',');
			}
			if (l>0) s.pop();
			s.push(']');
			break;
		case 'string':
			s.push('"');
			s.push(ZLM.jsonQuoteString(obj));
			s.push('"');
			break;
		default:
			s.push(""+obj);
	}
	return(s.join(""));
}

/// If native support to convert a JavaScript object into a JSON string is available
/// use it.  Otherwise use our own JSON code to structure the string for export.  The
/// flag forceLocal may to used the force the execution of our own generator if desired.
ZLM.jsonStringify = function(obj,forceLocal,skipPropQuotes) {
	if (!skipPropQuotes &&!forceLocal && JSON && JSON.stringify) {
		return(JSON.stringify(obj));
	}
	return(ZLM.jsonEncode(obj,skipQuoteProps));
}


/// If native support to convert a JSON string into a JavaScript object is available
/// use it.  Otherwise use our own JSON code to parse the string for import.  The
/// flag forceLocal may to used the force the execution of our own parser if desired.
ZLM.jsonParse = function(str,forceLocal) {
	if (!ZLM.isIE  && !forceLocal && JSON) {
		if (JSON.parse) {
			try {
				return(JSON.parse(str));
			} catch(ex) {
				var o=ZLM.jsonParseValue(str);
				if (o.obj) return(o.obj);
				return(null);
			}
		}
	}
	var o=ZLM.jsonParseValue(str);
	if (o.obj) return(o.obj);
	return(null);
}

// A JSON value is one of String, Array, Object, Number, true, false, null, 'undefined'  
ZLM.jsonParseValue=function(s) {
	var s = ZLM.jsonSkipWhitespace(s);
	var v = null;
	
	var c = s.charAt(0);
	if (c=='{') { // Object
		var o = ZLM.jsonParseObject(s);
		v = o.obj;
		s = o.s;
	}
	else if (c=='[') { // Array
		var o = ZLM.jsonParseArray(s);
		v = o.obj;
		s = o.s;
	}
	else if (c=="'" || c=='"') { // String
		var o = ZLM.jsonParseString(s);
		v = o.obj;
		s = o.s;
	}
	else { // true, false, null, or number
		if (s.indexOf("true")==0) {
			v = true;
			s = s.substring(4);
		}
		else if (s.indexOf("false")==0) {
			v = false;
			s = s.substring(5);
		}
		else if (s.indexOf("null")==0) {
			v = null;
			s = s.substring(4);
		}
		else { // number?
			var i = s.indexOf(',');
			var j = s.indexOf('}');
			if (j>=0 && (i==-1 || j<i)) i=j;
			v = parseFloat(s.substring(0,i));
			s = s.substring(i);			
		}
	}
	return({obj:v,s:s});
}

ZLM.jsonParseString=function(s) {
	var quote = s.charAt(0);
	s = s.substring(1);
	var done=false;
	var v = "";
	while (!done && s.length>0) {
		var i = s.indexOf(quote);
		if (i==0 || s.charAt(i-1)!='\\') done=true;
		else {
			v += s.substring(0,i+1);
			s = s.substring(i+1);	
		}
	}
	v += s.substring(0,i);
	v = ZLM.jsonUnquoteString(v);
	s = s.substring(i+1);	
	return({obj:v,s:s});
}

ZLM.jsonParseObject=function(s) {
	s = s.substring(1); // ditch leading '{'
	var done = false;
	var o = {};
	while (!done) {
		var endBrace = s.indexOf('}');
		var pivot = s.indexOf(':');
		if (pivot>0 && pivot<endBrace) {
			var attr = s.substring(0,pivot);
			attr = ZLM.jsonUndelimitString(attr);
			var value = null;
			s = s.substring(pivot+1);
			var v = ZLM.jsonParseValue(s);
			var value = v.obj;
			s = ZLM.jsonSkipWhitespace(v.s);
			if (s.charAt(0)==',') {
				s=ZLM.jsonSkipWhitespace(s.substring(1));
			}
			o[attr] = value;
		}
		else {
			done = true;
			s=ZLM.jsonSkipWhitespace(s);
			if (s.charAt(0)=='}') {
				s=s.substring(1);
			}
		}			
	}
	return({obj:o,s:s});
}

ZLM.jsonParseArray=function(s) {
	s = s.substring(1); // ditch leading '['
	var done = false;
	var a = [];
	var v = null;
	while (!done) {
		var c = s.charAt(0);
		if (c==']') {
			done=true;
			s = ZLM.jsonSkipWhitespace(s.substring(1));
		}
		else if (c==',') {
			s = ZLM.jsonSkipWhitespace(s.substring(1)); // Ditch comma between values
		}
		else {
			var o = ZLM.jsonParseValue(s);
			a.push(o.obj);
			s = ZLM.jsonSkipWhitespace(o.s);
		}
	}
	return({obj:a,s:s});
}


//=================//
// Global globals  //
//=================//

ZLM.isAppleMobile = function() {
	var agent = navigator.userAgent.toLowerCase();
	if(agent.indexOf('iphone') >= 0 || agent.indexOf('ipad') >= 0) return(true);
	return(false);
}

ZLM.isIE = ZLM.isInternetExplorer();
ZLM.isiOS = ZLM.isAppleMobile();
