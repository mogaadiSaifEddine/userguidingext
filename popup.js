document.addEventListener('DOMContentLoaded', function () {
    const exportBtn = document.getElementById('exportBtn');
    const statusDiv = document.getElementById('status');

    exportBtn.addEventListener('click', function () {
        statusDiv.textContent = 'Processing...';
        statusDiv.className = '';

        // Execute content script on the active tab
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (!tabs[0].url.includes('panel.userguiding.com')) {
                statusDiv.textContent = 'Error: Please navigate to UserGuiding panel first.';
                statusDiv.className = 'error';
                return;
            }

            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                files: ['contentScript.js']
            }).then(() => {
                statusDiv.textContent = 'Export initiated! Check the UserGuiding tab.';
                statusDiv.className = 'success';
            }).catch(err => {
                statusDiv.textContent = 'Error: ' + err.message;
                statusDiv.className = 'error';
                console.error('Failed to execute script: ', err);
            });
        });
    });
});