This is the client part of a web application called MarsComm.  There is also a closely related server part in a:\prog\MarsComm.  The system is meant to provide a simulated communication path between Earth and an outpost on Mars or some other place far enough away to cause significant speed-of-light communication delays.

This web app provides:

- time-delayed chat functionality

- support for writing and transfer of various mission reports

- a user interface with look-and-feel and branding appropriate for two analog astronaut research facilities -- MDRS and LunAres
  
   

The app has a published upstream clone on GitHub.  We don't want to push every change there immediately, but will do so on occasion. 

The app is, as of May 11, 2026 in a good working state.  We will want to make changes to it, but when we do, we should  be careful not to break existing functionality and should respect the existing coding style.  All changes should be made in a way that keeps the code size as small and simple as possible.  We don't want to bring in new libraries or otherwise make changes any larger than we have to, in order to meet the requirements.



Git tags use a simple integer style: v1, v2, v3, etc. (not semver). Apply the same tag to both repos simultaneously when tagging a release.

We want to create and maintain AppSpec.md files in both repos.  These files describe the functionality and technical design of the app well enough such that the code could later be re-generated from just the AppSpec.md files.  We can make the AppSpec.md in this client directory the main one that describes the overall application in addition to the client details, while the AppSpec.md in the server directory focuses only on the server.  The AppSpec.md files should always be updated immediately after making any significant feature change or refactoring.  The AppSpec.md files should be included in the repos.


