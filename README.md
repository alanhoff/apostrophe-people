# apostrophe-people

`apostrophe-people`, together with `apostrophe-groups`, adds staff directories, user accounts and user profiles to the [Apostrophe](http://github.com/punkave/apostrophe) content management system.

A "person" is anyone who can either log in, be seen in a personnel directory, or both. "Users" are simply people who have the "login" box checked and a username and password configured. This follows the MongoDB philosophy of avoiding gratuitous joins between users, profiles, etc.

People can be centrally managed via the "People" dropdown, and groups of people created via the "Groups" dropdown.

In addition, one can create a "directory page" to display a directory of people. For now people are displayed on such pages based on shared tags, however we plan to also give each user an affinity for a specific "home" page allowing for easier management of users.

See the a2 sandbox for a functional example.

## You Also Need Groups

You'll want to install both the people module and the [groups module](http://github.com/punkave/apostrophe-groups) to use this functionality successfully. Again, see the [a2 sandbox](http://github.com/punkave/apostrophe-sandbox) for a working example.

## The Directory Page

The directory page presents a directory of groups, which commonly represent departments within an organization. Only groups which are published are shown here.

When a site visitor clicks on a group, they are then shown a list of people in that group. Only people who have the "published" selector set to "Yes" are shown here.

TODO: provide an option to skip straight to a list of people throughout the organization, and make it easy for that to be the default behavior, as on many sites a public list of groups is overkill or secondary to the main alphabetical list of staff members.

## Subclassing and Overriding the Directory Page

The directory page is implemented by the `apostrophe-groups` module. You'll want to subclass that module, overriding the `index.html` template and perhaps extending or overriding the `show` and `isShow` methods, or overriding the `dispatch` method entirely, as your needs dictate. Currently the people module is able to use the dispatch method of the snippets module without modification for the main list of gropus. This will likely change soon when we introduce ways to skip directly to a list of all people in the organization.

This is similar to the way the `apostrophe-events` module subclasses and overrides portions of the `apostrophe-snippets` module.

## About Permissions

People receive basic permissions such as "guest," "edit" and "admin" via groups that have been given those permissions.

### Permission to View Content

People who are members of groups for which the "Admin" box has been checked can always view everything, whether it is published or not.

People who are members of groups for which the "Guest" or "Editor" box hs been checked has been checked can potentially view additional content:

* Guests and editors can view any page for which "Login Required" has been chosen from the "who can view this?" section of "Page Settings."

* Guests and editors are candidates to view pages for which "Certain People" has been chosen from the "who can view this?" section of "Page Settings." An admin must grant them that permission as an individual or as a group after selecting "Certain People."

* In addition, editors can always view content they have permission to edit, as described below.

### Permission to Edit Content

Similarly, people who are members of groups for which the "Editor" box is checked become candidates to edit pages. Someone with admin permissions can then click "Who can edit this?" under "Page Settings" and enter that person or group's name to add them to the list of editors for that particular page.

Those with editing permissions can also create and edit their own blog posts, events and so forth (but not people or groups). They cannot edit blog posts and events created by others (TODO: allow permissions to be granted for this in the same way edit permissions for pages are granted).

### Admin Permissions

Only people who are members of groups for which the "Admin" box is checked, and any hard-coded admin users in `app.js`, are permitted to carry out admin actions such as:

* Adding people
* Adding groups
* Changing and edit and view permissions.

