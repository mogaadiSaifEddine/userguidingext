(function () {
    // Get JWT token from localStorage
    const jwt = localStorage.getItem('__ugJWT');

    if (!jwt) {
        alert('Error: JWT token not found in localStorage. Please make sure you are logged into UserGuiding.');
        return;
    }

    console.log('UserGuiding Exporter: Fetching users data...');

    fetch("https://uapi.userguiding.com/panel/users", {
        "headers": {
            "accept": "application/json, text/plain, */*",
            "accept-language": "en,fr;q=0.9,fa;q=0.8,fi;q=0.7,en-US;q=0.6,ms;q=0.5,fr-FR;q=0.4,es;q=0.3,de;q=0.2,en-GB;q=0.1",
            "content-type": "application/json",
            "priority": "u=1, i",
            "sec-ch-ua": "\"Chromium\";v=\"134\", \"Not:A-Brand\";v=\"24\", \"Google Chrome\";v=\"134\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"Windows\"",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-site",
            "ug-api-token": jwt
        },
        "referrer": "https://panel.userguiding.com/",
        "referrerPolicy": "strict-origin-when-cross-origin",
        "body": "{\"page\":0,\"page_size\":100,\"filter_operator\":\"AND\",\"sort_field\":\"last_seen\",\"sort_order\":\"desc\",\"filters\":[{\"filter_operator\":\"OR\",\"children\":[{\"custom\":false,\"equation\":\"5\",\"event\":false,\"format\":\"date\",\"type\":\"last_seen\",\"value\":7}]}]}",
        "method": "POST",
        "mode": "cors",
        "credentials": "omit"
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data && data.users && Array.isArray(data.users)) {
                console.log(`UserGuiding Exporter: Retrieved ${data.users.length} users`);

                // Full user data
                const users = data.users;

                // Function to convert array to string
                const arrayToString = arr => {
                    if (!arr || !Array.isArray(arr)) return '';
                    return arr.join(';');
                };

                // Create CSV content
                let csvContent = [];

                // Get all columns from users
                const allColumns = new Set();
                users.forEach(user => {
                    Object.keys(user).forEach(key => {
                        // Only include non-object fields or simple arrays
                        if (typeof user[key] !== 'object' ||
                            (Array.isArray(user[key]) && user[key].every(item => typeof item !== 'object'))) {
                            allColumns.add(key);
                        }
                    });
                });

                // Convert to array and sort for consistent output
                const columns = Array.from(allColumns).sort();

                // Add header row
                csvContent.push(columns.join(','));

                // Add data rows
                users.forEach(user => {
                    const row = columns.map(col => {
                        const value = user[col];

                        // Format different data types
                        if (value === null || value === undefined) {
                            return '';
                        } else if (Array.isArray(value)) {
                            // Convert arrays to a string
                            const stringValue = arrayToString(value);
                            return `"${stringValue.replace(/"/g, '""')}"`;
                        } else if (typeof value === 'string') {
                            // Properly escape strings
                            return `"${value.replace(/"/g, '""')}"`;
                        } else if (typeof value === 'object') {
                            console.log('Skipping object:', value);

                            // For other objects, return empty string
                            return '';
                        } else {
                            // Numbers and booleans
                            return value;
                        }
                    });

                    csvContent.push(row.join(','));
                });

                // Join rows with newlines
                const csvString = csvContent.join('\n');

                // Create a blob and download
                const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);

                // Create a link element
                const downloadLink = document.createElement('a');
                downloadLink.href = url;
                downloadLink.download = `userguiding_users_export${new Date()}.csv`;

                // Append to body, click and remove
                document.body.appendChild(downloadLink);
                downloadLink.click();

                // Clean up
                setTimeout(() => {
                    document.body.removeChild(downloadLink);
                    URL.revokeObjectURL(url);
                }, 100);

                // Also display the data as a table (fallback)
                createDataTable(users, columns);

            } else {
                console.error('Invalid data structure:', data);
                alert('Error: Invalid data received from UserGuiding API.');
            }
        })
        .catch(error => {
            console.error('Error fetching data:', error);
            alert(`Error fetching user data: ${error.message}`);
        });

    // Function to create a data table as fallback
    function createDataTable(users, columns) {
        // Create table container
        const tableDiv = document.createElement('div');
        tableDiv.style.position = 'fixed';
        tableDiv.style.top = '0';
        tableDiv.style.left = '0';
        tableDiv.style.width = '100%';
        tableDiv.style.height = '100%';
        tableDiv.style.backgroundColor = 'white';
        tableDiv.style.zIndex = '9999';
        tableDiv.style.padding = '20px';
        tableDiv.style.overflow = 'auto';

        // Add close button
        const closeButton = document.createElement('button');
        closeButton.innerText = 'Close';
        closeButton.style.position = 'fixed';
        closeButton.style.top = '10px';
        closeButton.style.right = '10px';
        closeButton.style.padding = '5px 10px';
        closeButton.style.zIndex = '10000';
        closeButton.onclick = function () {
            document.body.removeChild(tableDiv);
        };
        tableDiv.appendChild(closeButton);

        // Add instructions
        const instructions = document.createElement('div');
        instructions.innerHTML = '<h2>UserGuiding Users Export</h2>' +
            '<p>A CSV file should have started downloading. If not, please use Ctrl+A to select all data below and Ctrl+C to copy to clipboard. Then paste into Excel.</p>' +
            '<p>Click the Close button when done.</p>';
        tableDiv.appendChild(instructions);

        // Create table
        const table = document.createElement('table');
        table.style.borderCollapse = 'collapse';
        table.style.width = '100%';
        table.style.marginTop = '20px';

        // Add header row
        const headerRow = document.createElement('tr');
        columns.forEach(col => {
            const th = document.createElement('th');
            th.style.border = '1px solid #ddd';
            th.style.padding = '8px';
            th.style.backgroundColor = '#f2f2f2';
            th.style.textAlign = 'left';
            th.textContent = col;
            headerRow.appendChild(th);
        });
        table.appendChild(headerRow);

        // Add data rows (limit to first 25 to avoid browser hanging)
        const maxRows = Math.min(users.length, 25);
        for (let i = 0; i < maxRows; i++) {
            const user = users[i];
            const row = document.createElement('tr');

            columns.forEach(col => {
                const td = document.createElement('td');
                td.style.border = '1px solid #ddd';
                td.style.padding = '8px';

                let value = user[col];
                if (value === null || value === undefined) {
                    value = '';
                } else if (Array.isArray(value)) {
                    value = value.join('; ');
                } else if (typeof value === 'object') {
                    value = '';
                }

                td.textContent = value;
                row.appendChild(td);
            });

            table.appendChild(row);
        }

        // Add note if we limited the rows
        if (users.length > maxRows) {
            const note = document.createElement('p');
            note.textContent = `Note: Showing ${maxRows} of ${users.length} users in preview. The CSV download contains all users.`;
            note.style.marginTop = '10px';
            note.style.fontStyle = 'italic';
            tableDiv.appendChild(note);
        }

        tableDiv.appendChild(table);
        document.body.appendChild(tableDiv);
    }
})();