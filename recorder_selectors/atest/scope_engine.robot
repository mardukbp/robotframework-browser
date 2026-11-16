*** Settings ***
Documentation    The scope selector engine the RecorderSelectors plugin registers: scope="Text"
...              keeps the elements whose closest visible text before them is Text, skipping
...              the text in links and controls and the text before an element looking the same.

Library          Browser                    plugins=${CURDIR}/../RecorderSelectors
Resource         recorder.resource

Test Setup       Open Page With Sections
Test Teardown    Close Page


*** Test Cases ***
Scope Keeps The Elements Under The Text Before Them
    Get Attribute    role=link[name="Course"] >> scope="Robot Framework"    href    ==    \#rf-course
    Get Attribute    role=link[name="Details"] >> scope="Highlights"        href    ==    \#hl-details

Scope Ignores The Names Of Links Before The Element
    Get Attribute        role=link[name="Webinar"] >> scope="Robot Framework"    href    ==    \#rf-webinar
    Get Element Count    role=link[name="Webinar"] >> scope="Course"             ==      0

Scope Accepts An Unquoted Text
    Get Attribute    role=link[name="Course"] >> scope=Highlights    href    ==    \#hl-course

Scope Is Only Text After The Last Lookalike Before The Element
    Get Element Count    role=button[name="Help"] >> scope="Name"                ==      1
    Get Element Count    role=button[name="Help"] >> scope="Notes"               ==      1
    Get Attribute        role=link[name="Details"] >> scope="Robot Framework"    href    ==    \#rf-details

Scope Finds Elements Nested At Any Depth
    Evaluate JavaScript
    ...                    id=rf-course
    ...                    (a) => a.replaceWith(Object.assign(document.createElement('div'), {innerHTML: '<span><b>' + a.outerHTML + '</b></span>'}))
    Get Attribute
    ...                    role=link[name="Course"] >> scope="Robot Framework"
    ...                    href
    ...                    ==
    ...                    \#rf-course


*** Keywords ***
Open Page With Sections
    New Page                ${PAGE_URL}
    VAR    ${sections} =
    ...    <section><h2>Highlights</h2><p><a id="hl-course" href="\#hl-course">Course</a> <a href="\#hl-details">Details</a></p></section>
    ...    <section><h2>Robot Framework</h2>
    ...    <p><a id="rf-course" href="\#rf-course">Course</a> <a href="\#rf-details">Details</a></p>
    ...    <p><a href="\#rf-webinar">Webinar</a> <a href="\#rf-details-2">Details</a></p></section>
    ...    <form><div><label>Name</label><input><span role="button" aria-label="Help">?</span></div>
    ...    <p>Notes</p><div><input><span role="button" aria-label="Help">?</span></div>
    ...    <div><input><span role="button" aria-label="Help">?</span></div></form>
    ...    separator=${EMPTY}
    Evaluate JavaScript
    ...                     ${None}
    ...                     (f) => document.body.insertAdjacentHTML('afterbegin', f)
    ...                     arg=${sections}
