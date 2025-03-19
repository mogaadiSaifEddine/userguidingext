// UserGuiding Analytics Exporter - Content Script
// This script runs in the context of the UserGuiding panel page

// Initialize when loaded
(function () {
    console.log('UserGuiding Analytics Exporter initialized');

    // Listen for messages from the popup
    chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
        if (request.action === "exportAnalytics") {
            exportAnalytics(request.options)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({
                    status: "error",
                    message: error.message || "Unknown error occurred"
                }));
            return true; // Indicates async response
        }
        return false;
    });

    // Main export function
    // Update the main export function to directly call the PDF generator
    // Main export function
    async function exportAnalytics(options) {
        try {
            // Get JWT token from localStorage
            const jwt = localStorage.getItem('__ugJWT');
            if (!jwt) {
                throw new Error('JWT token not found. Please make sure you are logged into UserGuiding.');
            }

            // Generate date string for filenames
            const date = new Date().toISOString().split('T')[0];
            let filesExported = 0;

            // Initialize data containers to prevent duplicate fetches
            let userData = null;
            let surveyData = null;
            let companyData = null;
            let questionMapping = null;

            // Initialize a master JSON object to store all fetched data
            const masterData = {
                exportDate: new Date().toISOString(),
                metadata: {
                    version: "2.0",
                    options: options
                },
                data: {}
            };

            // Fetch survey questions metadata first if we're including surveys
            if (options.includeSurveys || options.mergeUserSurvey) {
                console.log("Fetching survey question metadata...");
                questionMapping = await fetchSurveyQuestions(jwt);

                // Add to master data
                masterData.data.questionMapping = questionMapping;
            }
            console.log(options);

            // Fetch and export data based on options
            if (options.includeUsers) {
                console.log("Fetching users data...");
                userData = await fetchUsers(jwt, options.limitRows);
                console.log(`Found ${userData.length} users`);

                // Process data if anonymization is requested
                if (options.anonymizeData) {
                    userData = anonymizeUserData(userData);
                }

                // Add to master data
                masterData.data.users = userData;

                // Export Users CSV
                console.log("Exporting users data...");
                exportCSV(userData, `UserGuiding_Users_${date}.csv`);
                filesExported++;
            }

            if (options.includeSurveys) {
                console.log("Fetching survey responses...");
                surveyData = await fetchSurveys(jwt, options.limitRows);
                console.log(`Found ${surveyData.length} survey responses`);

                // Process data if anonymization is requested
                if (options.anonymizeData) {
                    surveyData = anonymizeSurveyData(surveyData);
                }

                // Enhance survey data with question text if available
                if (questionMapping) {
                    surveyData = enhanceSurveyDataWithQuestions(surveyData, questionMapping);
                }

                // Add to master data
                masterData.data.surveys = surveyData;

                // Export Surveys CSV
                console.log("Exporting survey data...");
                exportCSV(surveyData, `UserGuiding_Surveys_${date}.csv`);
                filesExported++;

                // Export a separate questions reference file for easier analysis
                if (questionMapping && Object.keys(questionMapping).length > 0) {
                    exportQuestionsReference(questionMapping, `UserGuiding_Questions_Reference_${date}.csv`);
                    filesExported++;
                }
            }

            if (options.includeCompanies) {
                console.log("Fetching company data...");
                companyData = await fetchCompanies(jwt, options.limitRows);
                console.log(`Found ${companyData.length} companies`);

                // Process data if anonymization is requested
                if (options.anonymizeData) {
                    companyData = anonymizeCompanyData(companyData);
                }

                // Add to master data
                masterData.data.companies = companyData;

                // Export Companies CSV
                console.log("Exporting company data...");
                exportCSV(companyData, `UserGuiding_Companies_${date}.csv`);
                filesExported++;
            }

            // Create and export merged data
            // Corrected section of the exportAnalytics function
            // Replace the mergeUserSurvey section with this code:

            if (options.mergeUserSurvey) {
                console.log("Creating user-survey merged data...");

                // Fetch data if not already fetched
                if (!userData) {
                    userData = await fetchUsers(jwt, options.limitRows);
                    if (options.anonymizeData) {
                        userData = anonymizeUserData(userData);
                    }
                }

                if (!surveyData) {
                    surveyData = await fetchSurveys(jwt, options.limitRows);

                    if (options.anonymizeData) {
                        surveyData = anonymizeSurveyData(surveyData);
                    }

                    // Enhance survey data with question text if available
                    if (questionMapping) {
                        surveyData = enhanceSurveyDataWithQuestions(surveyData, questionMapping);
                    }
                }

                const mergedData = mergeUserSurveyData(userData, surveyData);
                console.log(mergedData)
                // Add to master data
                masterData.data.userSurveyMerged = mergedData;

                // Export merged data - now with both user-centric and survey-centric versions
                console.log("Exporting user-centric merged data...");
                if (mergedData.userCentric && mergedData.userCentric.length > 0) {
                    exportCSV(mergedData.userCentric, `UserGuiding_Users-Survey_UserCentric_${date}.csv`);
                    filesExported++;
                } else {
                    console.warn("No user-centric merged data to export");
                }

                console.log("Exporting survey-centric merged data...");
                if (mergedData.surveyCentric && mergedData.surveyCentric.length > 0) {
                    exportCSV(mergedData.surveyCentric, `UserGuiding_Users-Survey_SurveyCentric_${date}.csv`);
                    filesExported++;
                } else {
                    console.warn("No survey-centric merged data to export");
                }
            }

            if (options.mergeUserCompany) {
                console.log("Creating user-company merged data...");

                // Fetch data if not already fetched
                if (!userData) {
                    userData = await fetchUsers(jwt, options.limitRows);
                    if (options.anonymizeData) {
                        userData = anonymizeUserData(userData);
                    }
                }

                if (!companyData) {
                    companyData = await fetchCompanies(jwt, options.limitRows);
                    if (options.anonymizeData) {
                        companyData = anonymizeCompanyData(companyData);
                    }
                }

                const mergedData = mergeUserCompanyData(userData, companyData);

                // Add to master data
                masterData.data.userCompanyMerged = mergedData;

                // Export merged data
                console.log("Exporting user-company merged data...");
                exportCSV(mergedData, `UserGuiding_Users-Company_${date}.csv`);
                filesExported++;
            }

            // Export the combined JSON data
            // console.log("Creating combined JSON export...");
            // exportJSON(masterData, `UserGuiding_Complete_Export_${date}.json`);
            // filesExported++;

            // Export a README file with analysis instructions
            if (options.includeGuide) {
                console.log("Creating analysis instructions...");
                exportAnalysisInstructions(date, !!questionMapping);
                filesExported++;
            }

            // Generate PDF report if requested
            let pdfFilename = null;
            if (options.generatePDFReport) {
                try {
                    console.log("Generating PDF report...");

                    // Check if we have data to generate a report
                    if (!userData && !surveyData && !companyData) {
                        console.warn("No data available for PDF report generation");
                    } else {
                        // Generate the PDF report
                        pdfFilename = await generatePDFReport(
                            userData || [],
                            surveyData || [],
                            companyData || [],
                            questionMapping || {},
                            options
                        );
                        console.log(`PDF report generated: ${pdfFilename}`);
                        filesExported++;
                    }
                } catch (error) {
                    console.error('Error generating PDF report:', error);
                    // Continue with the export process even if PDF generation fails
                }
            }

            console.log("Export complete!");

            // Return success
            return {
                status: "success",
                message: pdfFilename
                    ? `Successfully exported ${filesExported} files including PDF report.`
                    : `Successfully exported ${filesExported} files.`,
                pdfGenerated: !!pdfFilename,
                data: {
                    userData,
                    surveyData,
                    companyData,
                    questionMapping
                }
            };

        } catch (error) {
            console.error('Export error:', error);
            return {
                status: "error",
                message: error.message || "Unknown error occurred"
            };
        }
    }

    // Helper function to export data as JSON
    function exportJSON(data, filename) {
        if (!data) return;

        // Format the JSON with indentation for readability
        const jsonContent = JSON.stringify(data, null, 2);

        // Create and download file
        const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();

        // Clean up
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);
    }
    // Helper function to export analysis instructions
    function exportAnalysisInstructions(date, hasSurveyQuestions) {
        const instructions = `
# UserGuiding Analytics Export Analysis Guide

Date of Export: ${new Date().toLocaleString()}

## Overview of Exported Files

This export contains several CSV files and potentially a PDF report with analytics visualizations. Here's what each file contains and how to analyze it:

### Raw Data Files

1. **UserGuiding_Users_${date}.csv**
   - Contains information about all users in your UserGuiding account
   - Key fields: user_id, email, first_seen, last_seen, web_sessions

2. **UserGuiding_Surveys_${date}.csv**
   - Contains all survey responses 
   - Key fields: response_id, survey_id, survey_name, user_id, created
   - Question responses are in columns with format: Q{question_id}_score, Q{question_id}_feedback, etc.

3. **UserGuiding_Companies_${date}.csv**
   - Contains information about all companies in your UserGuiding account
   - Key fields: id, name, created, last_seen

${hasSurveyQuestions ? `4. **UserGuiding_Questions_Reference_${date}.csv**
   - Maps question IDs to question text for easier analysis
   - Key fields: question_id, survey_id, survey_name, question_text, question_type, choices` : ''}

### Merged Data Files

1. **UserGuiding_Users-Survey_UserCentric_${date}.csv**
   - User-centric view of survey data - one row per user-survey response
   - Contains all user fields plus survey response data
   - Use for analyzing user behavior and survey responses together
   - Great for user journey analysis and segmentation

2. **UserGuiding_Users-Survey_SurveyCentric_${date}.csv**
   - Survey-centric view - organized by survey with respondent data
   - One row per survey response with user information
   - Use for survey-focused analysis and identifying patterns by survey type

3. **UserGuiding_Users-Company_${date}.csv**
   - Combines user data with their company information
   - One row per user with company details
   - Use for company-level analysis and account-based insights

## Analysis Recommendations

### User Engagement Analysis
1. Use the Users data to identify active vs. inactive users
2. Calculate key metrics like:
   - Active user percentage
   - Average sessions per user
   - User retention over time

### Survey Response Analysis
1. Calculate response rates for each survey
2. Identify trends in satisfaction scores
3. Analyze feedback by user segments or companies
4. Look for correlations between survey scores and user activity

### Company-Level Analysis
1. Identify top companies by user count or survey responses
2. Calculate average scores and engagement metrics by company
3. Find companies with declining engagement for proactive outreach

## Data Visualization Recommendations

Use tools like Excel, Google Sheets, Tableau, or PowerBI to create:

1. User activity heatmaps
2. Survey response distribution charts
3. Company engagement dashboards
4. Trend analysis over time

## Contact

For questions about this export or additional analysis needs, please contact support@userguiding.com
`;

        // Create and download file
        const blob = new Blob([instructions], { type: 'text/plain;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `UserGuiding_Analysis_Guide_${date}.txt`);
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();

        // Clean up
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);
    }
    // Helper function to fetch survey questions metadata
    async function fetchSurveyQuestions(jwt) {
        try {
            // First, fetch the list of surveys
            const surveysResponse = await fetch("https://uapi.userguiding.com/panel/companies", {
                "headers": {
                    "accept": "application/json, text/plain, */*",
                    "accept-language": "en,fr;q=0.9,de;q=0.8,fa;q=0.7,fi;q=0.6,en-US;q=0.5,ms;q=0.4,fr-FR;q=0.3,es;q=0.2,en-GB;q=0.1",
                    "content-type": "application/json",
                    "priority": "u=1, i",
                    "sec-ch-ua": "\"Chromium\";v=\"134\", \"Not:A-Brand\";v=\"24\", \"Google Chrome\";v=\"134\"",
                    "sec-ch-ua-mobile": "?0",
                    "sec-ch-ua-platform": "\"Windows\"",
                    "sec-fetch-dest": "empty",
                    "sec-fetch-mode": "cors",
                    "sec-fetch-site": "same-site",
                    "ug-api-token": jwt,
                    "x-session-id": "onip7ajub"
                },
                "referrer": "https://panel.userguiding.com/",
                "referrerPolicy": "strict-origin-when-cross-origin",
                "body": "{\"page\":0,\"page_size\":20,\"filter_operator\":\"AND\",\"sort_field\":\"last_seen\",\"sort_order\":\"desc\",\"filters\":[{\"children\":[{\"type\":\"first_seen\",\"event\":false,\"value\":1741734000000,\"custom\":false,\"format\":\"date\",\"equation\":\"1\"}],\"filter_operator\":\"OR\"}]}",
                "method": "POST",
                "mode": "cors",
                "credentials": "omit"
            });

            if (!surveysResponse.ok) {
                console.warn(`Failed to fetch surveys: ${surveysResponse.status} ${surveysResponse.statusText}`);
                return {};
            }

            const surveysData = await surveysResponse.json();
            if (!surveysData.surveys || !Array.isArray(surveysData.surveys)) {
                return {};
            }

            // Create a mapping of question IDs to question text
            const questionMapping = {};

            // Process each survey to extract questions
            for (const survey of surveysData.surveys) {
                const surveyId = survey.id;

                // Fetch details for each survey to get questions
                const surveyDetailResponse = await fetch("https://uapi.userguiding.com/panel/survey-responses", {
                    "headers": {
                        "accept": "application/json, text/plain, */*",
                        "accept-language": "en,fr;q=0.9,de;q=0.8,fa;q=0.7,fi;q=0.6,en-US;q=0.5,ms;q=0.4,fr-FR;q=0.3,es;q=0.2,en-GB;q=0.1",
                        "content-type": "application/json",
                        "priority": "u=1, i",
                        "sec-ch-ua": "\"Chromium\";v=\"134\", \"Not:A-Brand\";v=\"24\", \"Google Chrome\";v=\"134\"",
                        "sec-ch-ua-mobile": "?0",
                        "sec-ch-ua-platform": "\"Windows\"",
                        "sec-fetch-dest": "empty",
                        "sec-fetch-mode": "cors",
                        "sec-fetch-site": "same-site",
                        "ug-api-token": jwt,
                        "x-session-id": "onip7ajub"
                    },
                    "referrer": "https://panel.userguiding.com/",
                    "referrerPolicy": "strict-origin-when-cross-origin",
                    "body": "{\"survey_id\":\"4961\",\"page_size\":20,\"page\":0,\"start_date\":\"2025-03-10T23:00:00.000Z\",\"end_date\":\"2025-03-17T22:59:59.999Z\"}",
                    "method": "POST",
                    "mode": "cors",
                    "credentials": "omit"
                });


                if (surveyDetailResponse.ok) {
                    const surveyDetail = await surveyDetailResponse.json();

                    if (surveyDetail && surveyDetail.questions && Array.isArray(surveyDetail.questions)) {
                        // Process each question
                        surveyDetail.questions.forEach(question => {
                            const questionId = question.id;
                            const questionText = question.text || 'Unnamed Question';

                            // Store in our mapping
                            questionMapping[questionId] = {
                                survey_id: surveyId,
                                survey_name: survey.name || `Survey ${surveyId}`,
                                question_text: questionText,
                                question_type: question.type || 'unknown'
                            };

                            // If multiple choice, add options
                            if (question.choices && Array.isArray(question.choices)) {
                                questionMapping[questionId].choices = question.choices.map(choice => choice.text).join('; ');
                            }
                        });
                    }
                }
            }

            // Also fetch analytics for question responses if available
            try {
                const analyticsResponse = await fetch("https://uapi.userguiding.com/panel/analytics/surveys", {
                    method: "GET",
                    headers: {
                        "accept": "application/json",
                        "ug-api-token": jwt
                    }
                });

                if (analyticsResponse.ok) {
                    const analyticsData = await analyticsResponse.json();

                    // Process analytics data to enhance our question mapping
                    if (analyticsData && analyticsData.question_analytics) {
                        // Store analytics by question
                        for (const question_id in analyticsData) {
                            if (question_id.startsWith('question_') && analyticsData[question_id]) {
                                const qid = question_id.replace('question_', '');
                                if (questionMapping[qid]) {
                                    questionMapping[qid].analytics = analyticsData[question_id];
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                console.warn('Error fetching question analytics:', error);
                // Continue without analytics data
            }

            return questionMapping;

        } catch (error) {
            console.warn('Error fetching survey questions:', error);
            return {}; // Return empty mapping if error occurs
        }
    }

    // Helper function to enhance survey data with question text
    function enhanceSurveyDataWithQuestions(surveyData, questionMapping) {
        if (!surveyData || !Array.isArray(surveyData) || !questionMapping) {
            return surveyData;
        }

        return surveyData.map(response => {
            const enhanced = { ...response };

            // Look for answer fields (in format Q{id}_score, Q{id}_feedback, Q{id}_choices)
            Object.keys(enhanced).forEach(key => {
                if (key.startsWith('Q') && key.includes('_')) {
                    const parts = key.split('_');
                    const questionId = parts[0].substring(1); // Remove 'Q' prefix
                    const answerType = parts[1]; // score, feedback, or choices

                    if (questionMapping[questionId]) {
                        // Add question text as a new column
                        const questionInfo = questionMapping[questionId];

                        // Create column with question text
                        const questionTextKey = `${key}_text`;
                        enhanced[questionTextKey] = questionInfo.question_text;

                        // If choices column and we have choice options, add them
                        if (answerType === 'choices' && questionInfo.choices) {
                            enhanced[`${key}_options`] = questionInfo.choices;
                        }
                    }
                }
            });

            return enhanced;
        });
    }

    // Helper function to export questions reference file
    function exportQuestionsReference(questionMapping, filename) {
        if (!questionMapping || Object.keys(questionMapping).length === 0) {
            return;
        }

        // Convert to array of objects
        const questionsArray = Object.keys(questionMapping).map(questionId => {
            const questionInfo = questionMapping[questionId];
            return {
                question_id: questionId,
                survey_id: questionInfo.survey_id,
                survey_name: questionInfo.survey_name,
                question_text: questionInfo.question_text,
                question_type: questionInfo.question_type,
                choices: questionInfo.choices || '',
                analytics_summary: questionInfo.analytics ? JSON.stringify(questionInfo.analytics) : ''
            };
        });

        // Export as CSV
        exportCSV(questionsArray, filename);
    }

    // Helper function to fetch Users data
    // Helper function to fetch Users data with efficient pagination
    async function fetchUsers(jwt, limitRows = false) {
        // Initial request to get total count
        const initialBody = {
            page: 0,
            page_size: 1, // Just need to get the total count, not actual data
            filter_operator: "AND",
            sort_field: "last_seen",
            sort_order: "desc",
            "filters": [
                {
                    "children": [
                        {
                            "type": "",
                            "event": false,
                            "value": null,
                            "custom": false,
                            "format": "survey_interaction",
                            "equation": "seen",
                            "metadata": {
                                "survey_id": "4961"
                            }
                        }
                    ],
                    "filter_operator": "OR"
                },
                {
                    "children": [
                        {
                            "type": "company_id",
                            "event": false,
                            "value": null,
                            "custom": false,
                            "format": "str",
                            "target": "company",
                            "equation": "has_any_value"
                        }
                    ],
                    "filter_operator": "OR"
                }
            ]
        };

        // Make initial request to get total count
        const initialResponse = await fetch("https://uapi.userguiding.com/panel/users", {
            method: "POST",
            headers: {
                "accept": "application/json",
                "content-type": "application/json",
                "ug-api-token": jwt
            },
            body: JSON.stringify(initialBody)
        });

        if (!initialResponse.ok) {
            throw new Error(`Failed to fetch users count: ${initialResponse.status} ${initialResponse.statusText}`);
        }

        const initialData = await initialResponse.json();
        const totalUsers = initialData.filtered_users_count || 0;

        // If no users, return empty array
        if (totalUsers === 0) {
            return [];
        }

        // Define page size for efficient fetching
        const size_of_page = 100; // Can be adjusted based on API capabilities

        // Calculate number of API calls required
        const number_of_calls = Math.ceil(totalUsers / size_of_page);

        console.log(`Fetching ${totalUsers} users with page size ${size_of_page} (${number_of_calls} API calls required)`);

        // Fetch all pages in parallel for efficiency
        const fetchPromises = [];

        for (let page = 0; page < number_of_calls; page++) {
            // Skip additional API calls if we're limiting rows and already have enough
            if (limitRows && page * size_of_page >= 1000) {
                break;
            }


            const pageBody = {
                page: page,
                "page_size": 100,
                "filter_operator": "AND",
                "sort_field": "last_seen",
                "sort_order": "desc",
                "filters": [
                    {
                        "children": [
                            {
                                "type": "",
                                "event": false,
                                "value": null,
                                "custom": false,
                                "format": "survey_interaction",
                                "equation": "seen",
                                "metadata": {
                                    "survey_id": "4961"
                                }
                            }
                        ],
                        "filter_operator": "OR"
                    },
                    {
                        "children": [
                            {
                                "type": "company_id",
                                "event": false,
                                "value": null,
                                "custom": false,
                                "format": "str",
                                "target": "company",
                                "equation": "has_any_value"
                            }
                        ],
                        "filter_operator": "OR"
                    }
                ]
            }

            const fetchPromise = fetch("https://uapi.userguiding.com/panel/users", {
                method: "POST",
                headers: {
                    "accept": "application/json",
                    "content-type": "application/json",
                    "ug-api-token": jwt
                },
                body: JSON.stringify(pageBody)
            }).then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to fetch users (page ${page}): ${response.status} ${response.statusText}`);
                }
                return response.json();
            });

            fetchPromises.push(fetchPromise);
        }

        // Wait for all fetches to complete
        const results = await Promise.all(fetchPromises);

        // Process and combine all user data
        const processedUsers = [];

        results.forEach(data => {
            if (data.users && Array.isArray(data.users)) {
                data.users.forEach(user => {
                    const flatUser = {};

                    // Process all properties
                    for (const key in user) {
                        if (user.hasOwnProperty(key)) {
                            const value = user[key];

                            // Handle complex objects and arrays
                            if (Array.isArray(value)) {
                                // Convert arrays to strings
                                flatUser[key] = value.join(';');
                            } else if (value !== null && typeof value === 'object') {
                                // Convert objects to JSON strings
                                flatUser[key] = JSON.stringify(value);
                            } else {
                                // Keep primitives as is
                                flatUser[key] = value;
                            }
                        }
                    }

                    processedUsers.push(flatUser);
                });
            }
        });

        // Apply row limit if specified
        if (limitRows && processedUsers.length > 1000) {
            return processedUsers.slice(0, 1000);
        }

        return processedUsers;
    }

    // Helper function to fetch Survey data
    // Helper function to fetch Survey data with pagination
    async function fetchSurveys(jwt, limitRows = false) {
        // First get the list of surveys to iterate through
        const surveysResponse = await fetch("https://uapi.userguiding.com/panel/survey-responses", {
            method: "POST",
            headers: {
                "accept": "application/json",
                "content-type": "application/json",
                "ug-api-token": jwt
            },
            body: JSON.stringify({
                "survey_id": "4961",
                "page_size": 20,
                "page": 0,
                "start_date": "2025-03-10T23:00:00.000Z",
                "end_date": "2025-03-19T22:59:59.999Z"
            })
        });

        if (!surveysResponse.ok) {
            throw new Error(`Failed to fetch surveys list: ${surveysResponse.status} ${surveysResponse.statusText}`);
        }

        const surveysData = await surveysResponse.json();
        let allResponses = [];

        // If no surveys found, return empty array
        if (!surveysData.surveys || !Array.isArray(surveysData.surveys) || surveysData.surveys.length === 0) {
            return [];
        }

        // Set dates for fetching survey data (last 30 days by default)
        const endDate = new Date().toISOString();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        const startDateString = startDate.toISOString();

        console.log(`Fetching survey responses from ${startDateString} to ${endDate}`);

        // Iterate through each survey
        for (const survey of surveysData.surveys) {
            const surveyId = survey.id;
            const surveyName = survey.name || `Survey ${surveyId}`;

            console.log(`Processing survey: ${surveyName} (ID: ${surveyId})`);

            // Initial request to get total count for this survey
            const initialBody = {
                survey_id: surveyId,
                page_size: 1,
                page: 0,
                start_date: startDateString,
                end_date: endDate
            };

            const initialResponse = await fetch("https://uapi.userguiding.com/panel/survey-responses", {
                method: "POST",
                headers: {
                    "accept": "application/json, text/plain, */*",
                    "content-type": "application/json",
                    "ug-api-token": jwt
                },
                body: JSON.stringify(initialBody)
            });

            if (!initialResponse.ok) {
                console.warn(`Failed to fetch responses for survey ${surveyId}: ${initialResponse.status} ${initialResponse.statusText}`);
                continue; // Skip to next survey
            }

            const initialData = await initialResponse.json();
            const totalResponses = initialData.count || 0;

            if (totalResponses === 0) {
                console.log(`No responses found for survey ${surveyId}`);
                continue; // Skip to next survey
            }

            // Define page size for efficient fetching
            const size_of_page = 50; // Can be adjusted based on API capabilities

            // Calculate number of API calls required
            const number_of_calls = Math.ceil(totalResponses / size_of_page);

            console.log(`Fetching ${totalResponses} responses for survey ${surveyId} with page size ${size_of_page} (${number_of_calls} API calls required)`);

            // Check if we should limit for this survey based on already fetched responses
            if (limitRows && allResponses.length >= 1000) {
                console.log(`Already reached limit of 1000 responses, skipping survey ${surveyId}`);
                break;
            }

            // Fetch all pages in parallel for efficiency
            const fetchPromises = [];

            for (let page = 0; page < number_of_calls; page++) {
                // Skip additional API calls if we're limiting rows and already have enough
                if (limitRows && (allResponses.length + (page * size_of_page)) >= 1000) {
                    break;
                }

                const pageBody = {
                    survey_id: surveyId,
                    page_size: size_of_page,
                    page: page,
                    start_date: startDateString,
                    end_date: endDate
                };

                const fetchPromise = fetch("https://uapi.userguiding.com/panel/survey-responses", {
                    method: "POST",
                    headers: {
                        "accept": "application/json, text/plain, */*",
                        "content-type": "application/json",
                        "ug-api-token": jwt
                    },
                    body: JSON.stringify(pageBody)
                }).then(response => {
                    if (!response.ok) {
                        throw new Error(`Failed to fetch survey responses (survey ${surveyId}, page ${page}): ${response.status} ${response.statusText}`);
                    }
                    return response.json();
                });

                fetchPromises.push(fetchPromise);
            }

            // Wait for all fetches to complete for this survey
            const results = await Promise.all(fetchPromises);

            // Process responses for this survey
            results.forEach(data => {
                if (data.responses && Array.isArray(data.responses)) {
                    data.responses.forEach(response => {
                        const flatResponse = {
                            response_id: response.id,
                            survey_id: response.survey_id,
                            survey_name: surveyName,
                            user_id: response.user_id,
                            created: response.created
                        };

                        // Add each answer as a separate field
                        if (response.answers && Array.isArray(response.answers)) {
                            response.answers.forEach(answer => {
                                const questionId = answer.question_id;

                                // Handle different answer types
                                if (answer.score !== null && answer.score !== undefined) {
                                    flatResponse[`Q${questionId}_score`] = answer.score;
                                }

                                if (answer.feedback) {
                                    flatResponse[`Q${questionId}_feedback`] = answer.feedback;
                                }

                                if (answer.choices && answer.choices.length) {
                                    flatResponse[`Q${questionId}_choices`] = answer.choices.join('; ');
                                }
                            });
                        }

                        allResponses.push(flatResponse);
                    });
                }
            });

            // Check if we've reached the limit after processing this survey
            if (limitRows && allResponses.length >= 1000) {
                console.log(`Reached limit of 1000 responses after processing survey ${surveyId}`);
                break;
            }
        }

        // Apply row limit if specified
        if (limitRows && allResponses.length > 1000) {
            return allResponses.slice(0, 1000);
        }

        return allResponses;
    }

    // Helper function to fetch Companies data
    // Helper function to fetch Companies data with pagination
    async function fetchCompanies(jwt, limitRows = false) {
        // Initial request to get total count
        const initialBody = {
            page: 0,
            page_size: 1, // Just need to get the total count, not actual data
            filter_operator: "AND",
            sort_field: "last_seen",
            sort_order: "desc",
            filters: [
                {
                    "children": [
                        {
                            "type": "first_seen",
                            "event": false,
                            "value": 1741734000000,
                            "custom": false,
                            "format": "date",
                            "equation": "1"
                        }
                    ],
                    "filter_operator": "OR"
                }
            ]
        };

        // Make initial request to get total count
        const initialResponse = await fetch("https://uapi.userguiding.com/panel/companies", {
            method: "POST",
            headers: {
                "accept": "application/json, text/plain, */*",
                "content-type": "application/json",
                "ug-api-token": jwt
            },
            body: JSON.stringify(initialBody)
        });

        if (!initialResponse.ok) {
            throw new Error(`Failed to fetch companies count: ${initialResponse.status} ${initialResponse.statusText}`);
        }

        const initialData = await initialResponse.json();
        const totalCompanies = initialData.filtered_companies_count || 0;

        // If no companies, return empty array
        if (totalCompanies === 0) {
            return [];
        }

        // Define page size for efficient fetching
        const size_of_page = 100; // Can be adjusted based on API capabilities

        // Calculate number of API calls required
        const number_of_calls = Math.ceil(totalCompanies / size_of_page);

        console.log(`Fetching ${totalCompanies} companies with page size ${size_of_page} (${number_of_calls} API calls required)`);

        // Fetch all pages in parallel for efficiency
        const fetchPromises = [];

        for (let page = 0; page < number_of_calls; page++) {
            // Skip additional API calls if we're limiting rows and already have enough
            if (limitRows && page * size_of_page >= 1000) {
                break;
            }

            const pageBody = {
                page: page,
                page_size: size_of_page,
                filter_operator: "AND",
                sort_field: "last_seen",
                sort_order: "desc",
                filters: [
                    {
                        "children": [
                            {
                                "type": "first_seen",
                                "event": false,
                                "value": 1741734000000,
                                "custom": false,
                                "format": "date",
                                "equation": "1"
                            }
                        ],
                        "filter_operator": "OR"
                    }
                ]
            };

            const fetchPromise = fetch("https://uapi.userguiding.com/panel/companies", {
                method: "POST",
                headers: {
                    "accept": "application/json, text/plain, */*",
                    "content-type": "application/json",
                    "ug-api-token": jwt
                },
                body: JSON.stringify(pageBody)
            }).then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to fetch companies (page ${page}): ${response.status} ${response.statusText}`);
                }
                return response.json();
            });

            fetchPromises.push(fetchPromise);
        }

        // Wait for all fetches to complete
        const results = await Promise.all(fetchPromises);

        // Process and combine all company data
        const processedCompanies = [];

        results.forEach(data => {
            if (data.companies && Array.isArray(data.companies)) {
                data.companies.forEach(company => {
                    const flatCompany = {};

                    // Process all properties
                    for (const key in company) {
                        if (company.hasOwnProperty(key)) {
                            const value = company[key];

                            // Handle complex objects and arrays
                            if (Array.isArray(value)) {
                                // Convert arrays to strings
                                flatCompany[key] = value.join(';');
                            } else if (value !== null && typeof value === 'object') {
                                // Convert objects to JSON strings
                                flatCompany[key] = JSON.stringify(value);
                            } else {
                                // Keep primitives as is
                                flatCompany[key] = value;
                            }
                        }
                    }

                    processedCompanies.push(flatCompany);
                });
            }
        });

        // Apply row limit if specified
        if (limitRows && processedCompanies.length > 1000) {
            return processedCompanies.slice(0, 1000);
        }

        return processedCompanies;
    }

    // Helper function to merge Users and Survey data
    function mergeUserSurveyData(users, surveys) {
        const mergedData = [];

        // Create a map of survey responses by user_id
        const surveysByUserId = {};
        if (surveys && Array.isArray(surveys)) {
            surveys.forEach(survey => {
                const userId = survey.user_id;
                if (userId) {
                    if (!surveysByUserId[userId]) {
                        surveysByUserId[userId] = [];
                    }
                    surveysByUserId[userId].push(survey);
                }
            });
        }

        // Merge user data with their survey responses
        if (users && Array.isArray(users)) {
            users.forEach(user => {
                const userId = user.user_id;
                const userSurveys = surveysByUserId[userId] || [];

                if (userSurveys.length > 0) {
                    // User has survey responses
                    userSurveys.forEach(survey => {
                        const mergedRecord = {
                            ...user,
                            has_survey_data: true
                        };

                        // Add survey fields with survey_ prefix for non-duplicated fields
                        Object.keys(survey).forEach(key => {
                            if (key !== 'user_id') {
                                mergedRecord[`survey_${key}`] = survey[key];
                            }
                        });

                        mergedData.push(mergedRecord);
                    });
                } else {
                    // User has no survey responses
                    mergedData.push({
                        ...user,
                        has_survey_data: false
                    });
                }
            });
        }
        console.log(mergedData)
        return mergedData;
    }

    // Helper function to merge Users and Company data
    function mergeUserCompanyData(users, companies) {
        const mergedData = [];

        // Create a map of companies by company_id
        const companiesById = {};
        if (companies && Array.isArray(companies)) {
            companies.forEach(company => {
                const companyId = company.id || company.company_id;
                if (companyId) {
                    companiesById[companyId] = company;
                }
            });
        }

        // Merge user data with their company data
        if (users && Array.isArray(users)) {
            users.forEach(user => {
                const companyId = user.company_id;
                const company = companiesById[companyId];

                const mergedRecord = {
                    ...user,
                    has_company_data: !!company
                };

                if (company) {
                    // Add company fields with company_ prefix for non-duplicated fields
                    Object.keys(company).forEach(key => {
                        if (key !== 'company_id' && key !== 'id') {
                            mergedRecord[`company_${key}`] = company[key];
                        }
                    });
                }

                mergedData.push(mergedRecord);
            });
        }

        return mergedData;
    }

    // Helper function to anonymize user data
    function anonymizeUserData(userData) {
        if (!userData || !Array.isArray(userData)) return userData;

        return userData.map(user => {
            const anonymized = { ...user };

            // Anonymize personal identifiers
            if (anonymized.company_id && typeof anonymized.company_id === 'string') {
                anonymized.company_id = 'company_' + hashString(anonymized.company_id);
            }

            if (anonymized.email && typeof anonymized.email === 'string') {
                anonymized.email = 'user_' + anonymized.user_id + '@example.com';
            }

            // Anonymize any field that might contain PII
            ['name', 'first_name', 'last_name', 'phone', 'address'].forEach(field => {
                if (anonymized[field]) {
                    anonymized[field] = '[REDACTED]';
                }
            });

            return anonymized;
        });
    }

    // Helper function to anonymize survey data
    function anonymizeSurveyData(surveyData) {
        if (!surveyData || !Array.isArray(surveyData)) return surveyData;

        return surveyData.map(survey => {
            const anonymized = { ...survey };

            // Anonymize free text responses but keep scores and choices
            Object.keys(anonymized).forEach(key => {
                if (key.includes('_feedback') && anonymized[key]) {
                    anonymized[key] = '[REDACTED FEEDBACK]';
                }
            });

            return anonymized;
        });
    }

    // Helper function to anonymize company data
    function anonymizeCompanyData(companyData) {
        if (!companyData || !Array.isArray(companyData)) return companyData;

        return companyData.map(company => {
            const anonymized = { ...company };

            // Preserve ID but anonymize name and contact info
            if (anonymized.name) {
                const id = anonymized.id || anonymized.company_id;
                anonymized.name = `Company ${id}`;
            }

            // Anonymize contact information
            ['email', 'phone', 'address', 'contact_person'].forEach(field => {
                if (anonymized[field]) {
                    anonymized[field] = '[REDACTED]';
                }
            });

            return anonymized;
        });
    }

    // Simple string hashing function for anonymization
    function hashString(str) {
        let hash = 0;
        if (!str) return hash;

        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }

        return Math.abs(hash).toString(16).substring(0, 8);
    }

    // Helper function to export data as CSV
    function exportCSV(data, filename) {
        const notIncludedItems = [
            "browser_language",
            "browser_name",
            "browser_version",
            "device_model",
            "device_type",
            "device_vendor",
            "os_name",
            "os_version",
            "last_product_updates_interacted",
            "last_ai_assistant_interacted",
            "web_session",
            "survey_score",
            "survey_feedback",
            "source",
            "attributes",
            "ab_test_attributes",
            "preview_start",
            "preview_complete",
            "hotspot_interact",
            "checklist_url_click",
            "hotspot_dismiss",
            "checklist_complete",
            "preview_dismiss",
            "checklist_dismiss",
            "group_ids",
            "survey_interaction_times",
            "guide_interaction_times",
            "hotspot_interaction_times",
            "guide_triggers_count",
            "survey_triggers_count",
            "survey_responses",
            "events_summary",
            "goal_reached_times",
            "ai_message_limit_exceeded",
            "company",
            "has_company_data",
            "company_company_ab_test_attributes",
            "company_company_attributes",
            "company_source",
        ]
        if (!data || !data.length) return;

        // Get headers from first object
        let headers = Object.keys(data[0]);
        console.log(headers);
        // headers=[... headers.filter(header => !notIncludedItems.includes(header))];
        console.log(headers)
        // Create CSV content
        let csvContent = headers.join(',') + '\n';

        // Add data rows
        data.forEach(item => {
            const row = headers.map(header => {
                const value = item[header];
                // Skip objects entirely
                if (typeof value == 'string' && value.includes('object') && value.includes(']') && header != 'company') {
                    return '';
                }
                if (value === null || value === undefined || typeof value === 'object') {
                    return '';
                } else if (typeof value === 'string') {
                    // Escape quotes and wrap in quotes
                    return `"${value.replace(/"/g, '""')}"`;
                } else {
                    return value;
                }
            });
            csvContent += row.join(',') + '\n';
        });

        // Create and download file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();

        // Clean up
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);
    }
    // Alternative PDF generation using direct download instead of print dialog
    async function generatePDFReport(userData, surveyData, companyData, questionMapping, options) {
        try {
            // Create a timestamp for the report
            const date = new Date().toISOString().split('T')[0];
            const timestamp = new Date().toLocaleString();
            const filename = `UserGuiding_Analytics_Report_${date}.html`;

            // Generate the HTML content
            const htmlContent = generateReportHTML(userData, surveyData, companyData, questionMapping, options, timestamp);

            // Create a Blob containing the HTML
            const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
            const url = URL.createObjectURL(blob);

            // Create a download link
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            link.style.display = 'none';
            document.body.appendChild(link);

            // Trigger download
            link.click();

            // Clean up
            setTimeout(() => {
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }, 100);

            // Show a message to the user about how to convert the HTML to PDF
            const message = document.createElement('div');
            message.style.position = 'fixed';
            message.style.top = '10px';
            message.style.left = '50%';
            message.style.transform = 'translateX(-50%)';
            message.style.backgroundColor = '#4285f4';
            message.style.color = 'white';
            message.style.padding = '10px 20px';
            message.style.borderRadius = '4px';
            message.style.zIndex = '9999';
            message.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
            message.innerHTML = 'HTML report downloaded. To convert to PDF, open the file and use your browser\'s Print function (Ctrl+P) to save as PDF.';

            document.body.appendChild(message);

            // Remove the message after a few seconds
            setTimeout(() => {
                document.body.removeChild(message);
            }, 8000);

            return filename;
        } catch (error) {
            console.error('Error generating report:', error);
            throw error;
        }
    }
    // Generate the HTML content for the report
    function generateReportHTML(userData, surveyData, companyData, questionMapping, options, timestamp) {
        // Prepare data for charts
        const userEngagementData = prepareUserEngagementData(userData);
        const surveyResponseData = prepareSurveyResponseData(surveyData);
        const companyDistributionData = prepareCompanyDistributionData(userData, companyData);

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>UserGuiding Analytics Report</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 0;
                    padding: 20px;
                    color: #333;
                }
                .page-break {
                    page-break-after: always;
                }
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                }
                .title {
                    color: #4285f4;
                    font-size: 24px;
                    margin-bottom: 10px;
                }
                .subtitle {
                    color: #666;
                    font-size: 14px;
                    margin-bottom: 5px;
                }
                .section-title {
                    color: #4285f4;
                    font-size: 18px;
                    margin-top: 20px;
                    margin-bottom: 10px;
                    border-bottom: 1px solid #ddd;
                    padding-bottom: 5px;
                }
                .section-subtitle {
                    color: #666;
                    font-size: 16px;
                    margin-top: 15px;
                    margin-bottom: 10px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 20px;
                }
                th {
                    background-color: #4285f4;
                    color: white;
                    padding: 8px;
                    text-align: left;
                }
                td {
                    padding: 8px;
                    border-bottom: 1px solid #ddd;
                }
                tr:nth-child(even) {
                    background-color: #f9f9f9;
                }
                .chart-container {
                    width: 100%;
                    height: 300px;
                    margin-bottom: 20px;
                    background-color: #f5f5f5;
                    border: 1px solid #ddd;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .metric-card {
                    background-color: #f9f9f9;
                    border: 1px solid #ddd;
                    border-radius: 5px;
                    padding: 15px;
                    margin-bottom: 15px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                }
                .metric-title {
                    font-size: 14px;
                    color: #666;
                    margin-bottom: 5px;
                }
                .metric-value {
                    font-size: 24px;
                    color: #4285f4;
                    font-weight: bold;
                }
                .footer {
                    text-align: center;
                    font-size: 10px;
                    color: #999;
                    margin-top: 30px;
                }
                .metric-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 15px;
                    margin-bottom: 20px;
                }
                @media print {
                    body {
                        padding: 0;
                    }
                    .page-break {
                        page-break-after: always;
                    }
                }
                .bar-chart {
                    display: flex;
                    align-items: flex-end;
                    height: 250px;
                    padding: 10px 0;
                }
                .bar {
                    flex: 1;
                    margin: 0 5px;
                    background-color: #4285f4;
                    min-width: 20px;
                    border-radius: 3px 3px 0 0;
                    position: relative;
                }
                .bar-label {
                    position: absolute;
                    bottom: -20px;
                    left: 0;
                    right: 0;
                    text-align: center;
                    font-size: 10px;
                    transform: rotate(-45deg);
                    transform-origin: top right;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .bar-value {
                    position: absolute;
                    top: -20px;
                    left: 0;
                    right: 0;
                    text-align: center;
                    font-size: 10px;
                }
                .pie-chart {
                    width: 250px;
                    height: 250px;
                    border-radius: 50%;
                    background: conic-gradient(
                        ${generateConicGradient(companyDistributionData)}
                    );
                    margin: 0 auto;
                }
                .pie-legend {
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: center;
                    margin-top: 20px;
                }
                .legend-item {
                    display: flex;
                    align-items: center;
                    margin-right: 15px;
                    margin-bottom: 5px;
                }
                .legend-color {
                    width: 15px;
                    height: 15px;
                    margin-right: 5px;
                }
                .legend-label {
                    font-size: 12px;
                }
                .content-box {
                    border: 1px solid #ddd;
                    border-radius: 5px;
                    padding: 15px;
                    margin-bottom: 20px;
                }
                .insight-item {
                    padding: 8px 0;
                    border-bottom: 1px solid #eee;
                }
                .insight-item:last-child {
                    border-bottom: none;
                }
            </style>
        </head>
        <body>
            <!-- Title Page -->
            <div class="header">
                <div class="title">UserGuiding Analytics Report</div>
                <div class="subtitle">Generated on: ${timestamp}</div>
            </div>
            
            <div class="section-title">Report Overview</div>
            <div class="content-box">
                <p><strong>Data Included:</strong></p>
                <ul>
                    <li>User Data: ${options.includeUsers ? 'Yes' : 'No'}</li>
                    <li>Survey Data: ${options.includeSurveys ? 'Yes' : 'No'}</li>
                    <li>Company Data: ${options.includeCompanies ? 'Yes' : 'No'}</li>
                    <li>Merged User-Survey Data: ${options.mergeUserSurvey ? 'Yes' : 'No'}</li>
                    <li>Merged User-Company Data: ${options.mergeUserCompany ? 'Yes' : 'No'}</li>
                    <li>Data Anonymization: ${options.anonymizeData ? 'Yes' : 'No'}</li>
                </ul>
            </div>
            
            <div class="page-break"></div>
            
            <!-- Executive Summary -->
            <div class="section-title">Executive Summary</div>
            
            ${generateExecutiveSummaryHTML(userData, surveyData, companyData)}
            
            <div class="page-break"></div>
            
            ${userData && userData.length > 0 ? generateUserAnalyticsHTML(userData, userEngagementData) : ''}
            
            ${surveyData && surveyData.length > 0 ? generateSurveyAnalyticsHTML(surveyData, questionMapping, surveyResponseData) : ''}
            
            ${companyData && companyData.length > 0 ? generateCompanyAnalyticsHTML(companyData, userData, companyDistributionData) : ''}
            
            <!-- Data Appendix -->
            <div class="section-title">Data Appendix</div>
            
            <p>This report is based on the following data:</p>
            
            <div class="section-subtitle">Data Summary</div>
            <table>
                <tr>
                    <th>Data Type</th>
                    <th>Record Count</th>
                </tr>
                <tr>
                    <td>Users</td>
                    <td>${userData ? userData.length : 0}</td>
                </tr>
                <tr>
                    <td>Survey Responses</td>
                    <td>${surveyData ? surveyData.length : 0}</td>
                </tr>
                <tr>
                    <td>Companies</td>
                    <td>${companyData ? companyData.length : 0}</td>
                </tr>
            </table>
            
            <div class="footer">
                Generated by UserGuiding Analytics Exporter | ${timestamp}
            </div>
        </body>
        </html>
        `;
    }

    // Generate Executive Summary HTML
    function generateExecutiveSummaryHTML(userData, surveyData, companyData) {
        // Calculate key metrics
        const totalUsers = userData ? userData.length : 0;
        const activeUsers = userData ? userData.filter(user => user.web_sessions > 0).length : 0;
        const activePercentage = totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0;

        const totalResponses = surveyData ? surveyData.length : 0;
        const uniqueSurveys = surveyData ? new Set(surveyData.map(r => r.survey_id)).size : 0;

        const totalCompanies = companyData ? companyData.length : 0;

        // Generate key insights
        const insights = generateKeyInsights(userData, surveyData, companyData);

        return `
        <div class="metric-grid">
            ${totalUsers > 0 ? `
            <div class="metric-card">
                <div class="metric-title">Total Users</div>
                <div class="metric-value">${totalUsers}</div>
            </div>
            <div class="metric-card">
                <div class="metric-title">Active Users</div>
                <div class="metric-value">${activeUsers}</div>
            </div>
            <div class="metric-card">
                <div class="metric-title">Active User Rate</div>
                <div class="metric-value">${activePercentage}%</div>
            </div>
            ` : ''}
            
            ${totalResponses > 0 ? `
            <div class="metric-card">
                <div class="metric-title">Survey Responses</div>
                <div class="metric-value">${totalResponses}</div>
            </div>
            <div class="metric-card">
                <div class="metric-title">Unique Surveys</div>
                <div class="metric-value">${uniqueSurveys}</div>
            </div>
            ` : ''}
            
            ${totalCompanies > 0 ? `
            <div class="metric-card">
                <div class="metric-title">Total Companies</div>
                <div class="metric-value">${totalCompanies}</div>
            </div>
            ` : ''}
        </div>
        
        <div class="section-subtitle">Key Insights</div>
        <div class="content-box">
            ${insights.map(insight => `<div class="insight-item">• ${insight}</div>`).join('')}
        </div>
        `;
    }

    // Generate User Analytics HTML
    function generateUserAnalyticsHTML(userData, userEngagementData) {
        // Calculate user metrics
        const totalUsers = userData.length;
        const activeUsers = userData.filter(user => user.web_sessions > 0).length;
        const inactiveUsers = totalUsers - activeUsers;
        const activePercentage = Math.round((activeUsers / totalUsers) * 100);

        // Calculate session metrics
        const sessions = userData.map(user => Number(user.web_sessions) || 0);
        const totalSessions = sessions.reduce((sum, val) => sum + val, 0);
        const avgSessions = totalSessions / totalUsers || 0;

        // Sort users by session count
        const topUsers = [...userData]
            .sort((a, b) => (Number(b.web_sessions) || 0) - (Number(a.web_sessions) || 0))
            .slice(0, 10);

        return `
        <div class="section-title">User Analytics</div>
        
        <div class="section-subtitle">User Overview</div>
        <div class="metric-grid">
            <div class="metric-card">
                <div class="metric-title">Total Users</div>
                <div class="metric-value">${totalUsers}</div>
            </div>
            <div class="metric-card">
                <div class="metric-title">Active Users</div>
                <div class="metric-value">${activeUsers} (${activePercentage}%)</div>
            </div>
            <div class="metric-card">
                <div class="metric-title">Average Sessions</div>
                <div class="metric-value">${avgSessions.toFixed(1)}</div>
            </div>
        </div>
        
        <div class="section-subtitle">User Engagement Distribution</div>
        <div class="chart-container">
            <div class="bar-chart">
                ${userEngagementData.map(category => `
                    <div class="bar" style="height: ${Math.max(category.percentage, 3)}%;">
                        <div class="bar-value">${category.count}</div>
                        <div class="bar-label">${category.label}</div>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="section-subtitle">Top Users by Session Count</div>
        <table>
            <tr>
                <th>User ID</th>
                <th>Email</th>
                <th>Sessions</th>
                <th>Last Seen</th>
            </tr>
            ${topUsers.map(user => `
                <tr>
                    <td>${user.user_id || 'N/A'}</td>
                    <td>${user.email || 'N/A'}</td>
                    <td>${user.web_sessions || '0'}</td>
                    <td>${user.last_seen || 'N/A'}</td>
                </tr>
            `).join('')}
        </table>
        
        <div class="page-break"></div>
        `;
    }

    // Generate Survey Analytics HTML
    function generateSurveyAnalyticsHTML(surveyData, questionMapping, surveyResponseData) {
        // Calculate survey metrics
        const totalResponses = surveyData.length;

        // Calculate unique surveys and respondents
        const uniqueSurveys = new Set();
        const uniqueUsers = new Set();

        surveyData.forEach(response => {
            if (response.survey_id) uniqueSurveys.add(response.survey_id);
            if (response.user_id) uniqueUsers.add(response.user_id);
        });

        // Process question data if available
        let questionAnalysisHTML = '';

        if (questionMapping && Object.keys(questionMapping).length > 0) {
            // Prepare question data
            const questionRows = [];

            Object.keys(questionMapping).forEach(questionId => {
                const question = questionMapping[questionId];

                // Count responses for this question
                let responseCount = 0;
                let totalScore = 0;

                surveyData.forEach(response => {
                    const scoreKey = `Q${questionId}_score`;
                    if (response[scoreKey] !== undefined) {
                        responseCount++;
                        totalScore += Number(response[scoreKey]);
                    }
                });

                const avgScore = responseCount > 0 ? (totalScore / responseCount).toFixed(2) : 'N/A';

                questionRows.push(`
                    <tr>
                        <td>${questionId}</td>
                        <td>${question.question_text || 'N/A'}</td>
                        <td>${question.question_type || 'N/A'}</td>
                        <td>${responseCount}</td>
                        <td>${avgScore}</td>
                    </tr>
                `);
            });

            questionAnalysisHTML = `
                <div class="section-subtitle">Survey Question Analysis</div>
                <table>
                    <tr>
                        <th>Question ID</th>
                        <th>Question Text</th>
                        <th>Type</th>
                        <th>Responses</th>
                        <th>Avg Score</th>
                    </tr>
                    ${questionRows.join('')}
                </table>
            `;
        }

        return `
        <div class="section-title">Survey Analytics</div>
        
        <div class="section-subtitle">Survey Overview</div>
        <div class="metric-grid">
            <div class="metric-card">
                <div class="metric-title">Total Responses</div>
                <div class="metric-value">${totalResponses}</div>
            </div>
            <div class="metric-card">
                <div class="metric-title">Unique Surveys</div>
                <div class="metric-value">${uniqueSurveys.size}</div>
            </div>
            <div class="metric-card">
                <div class="metric-title">Unique Respondents</div>
                <div class="metric-value">${uniqueUsers.size}</div>
            </div>
        </div>
        
        <div class="section-subtitle">Survey Response Distribution</div>
        <div class="chart-container">
            <div class="bar-chart">
                ${surveyResponseData.map(survey => `
                    <div class="bar" style="height: ${Math.max(survey.percentage, 3)}%;">
                        <div class="bar-value">${survey.count}</div>
                        <div class="bar-label">${survey.label}</div>
                    </div>
                `).join('')}
            </div>
        </div>
        
        ${questionAnalysisHTML}
        
        <div class="page-break"></div>
        `;
    }

    // Generate Company Analytics HTML
    function generateCompanyAnalyticsHTML(companyData, userData, companyDistributionData) {
        const totalCompanies = companyData.length;

        // If user data is available, calculate company user distribution
        let companyUserHTML = '';
        let topCompaniesHTML = '';

        if (userData && userData.length > 0) {
            // Calculate company user counts
            const companyUserCount = {};

            userData.forEach(user => {
                if (user.company_id) {
                    companyUserCount[user.company_id] = (companyUserCount[user.company_id] || 0) + 1;
                }
            });

            // Create data for top companies
            const topCompanies = Object.keys(companyUserCount)
                .map(companyId => {
                    // Find company name if available
                    const company = companyData.find(c => c.id === companyId || c.company_id === companyId);
                    const companyName = company ? (company.name || `Company ${companyId}`) : `Company ${companyId}`;

                    return {
                        company_id: companyId,
                        company_name: companyName,
                        user_count: companyUserCount[companyId]
                    };
                })
                .sort((a, b) => b.user_count - a.user_count)
                .slice(0, 10); // Top 10

            // Calculate average users per company
            const avgUsersPerCompany = userData.length / totalCompanies;

            companyUserHTML = `
                <div class="metric-card">
                    <div class="metric-title">Average Users per Company</div>
                    <div class="metric-value">${avgUsersPerCompany.toFixed(1)}</div>
                </div>
            `;

            topCompaniesHTML = `
                <div class="section-subtitle">Top Companies by User Count</div>
                <table>
                    <tr>
                        <th>Company ID</th>
                        <th>Company Name</th>
                        <th>User Count</th>
                    </tr>
                    ${topCompanies.map(company => `
                        <tr>
                            <td>${company.company_id}</td>
                            <td>${company.company_name}</td>
                            <td>${company.user_count}</td>
                        </tr>
                    `).join('')}
                </table>
            `;
        }

        return `
        <div class="section-title">Company Analytics</div>
        
        <div class="section-subtitle">Company Overview</div>
        <div class="metric-grid">
            <div class="metric-card">
                <div class="metric-title">Total Companies</div>
                <div class="metric-value">${totalCompanies}</div>
            </div>
            ${companyUserHTML}
        </div>
        
        ${topCompaniesHTML}
        
        <div class="section-subtitle">Company Distribution</div>
        <div class="chart-container">
            <div>
                <div class="pie-chart"></div>
                <div class="pie-legend">
                    ${companyDistributionData.slice(0, 5).map((company, index) => `
                        <div class="legend-item">
                            <div class="legend-color" style="background-color: ${getChartColor(index)};"></div>
                            <div class="legend-label">${company.label}: ${company.count} users</div>
                        </div>
                    `).join('')}
                    ${companyDistributionData.length > 5 ?
                `<div class="legend-item">
                            <div class="legend-color" style="background-color: ${getChartColor(5)};"></div>
                            <div class="legend-label">Others: ${companyDistributionData.slice(5).reduce((sum, company) => sum + company.count, 0)} users</div>
                        </div>` : ''
            }
                </div>
            </div>
        </div>
        
        <div class="page-break"></div>
        `;
    }

    // Generate key insights based on the data
    function generateKeyInsights(userData, surveyData, companyData) {
        const insights = [];

        if (userData && userData.length > 0) {
            // User engagement insights
            const activeUsers = userData.filter(user => user.web_sessions > 0).length;
            const totalUsers = userData.length;
            const activePercentage = totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0;

            if (activePercentage > 75) {
                insights.push(`High user engagement with ${activePercentage}% active users.`);
            } else if (activePercentage > 50) {
                insights.push(`Moderate user engagement with ${activePercentage}% active users.`);
            } else {
                insights.push(`Opportunity to improve user engagement (currently at ${activePercentage}% active users).`);
            }

            // Session frequency insights
            const sessions = userData.map(user => Number(user.web_sessions) || 0);
            const avgSessions = sessions.reduce((sum, val) => sum + val, 0) / sessions.length || 0;

            if (avgSessions > 10) {
                insights.push(`Users are highly active with an average of ${avgSessions.toFixed(1)} sessions per user.`);
            } else if (avgSessions > 5) {
                insights.push(`Users show good activity with an average of ${avgSessions.toFixed(1)} sessions per user.`);
            } else {
                insights.push(`Users average ${avgSessions.toFixed(1)} sessions each, indicating potential for increased engagement.`);
            }
        }

        if (surveyData && surveyData.length > 0) {
            // Survey completion insights
            const uniqueUsers = new Set(surveyData.map(r => r.user_id)).size;

            if (userData && userData.length > 0) {
                const surveyParticipationRate = Math.round((uniqueUsers / userData.length) * 100);

                if (surveyParticipationRate > 50) {
                    insights.push(`Excellent survey participation rate of ${surveyParticipationRate}% of users.`);
                } else if (surveyParticipationRate > 25) {
                    insights.push(`Good survey participation rate of ${surveyParticipationRate}% of users.`);
                } else {
                    insights.push(`Survey participation is at ${surveyParticipationRate}% of users, indicating potential for improvement.`);
                }
            }

            // Calculate average sentiment if available
            const avgSentiment = calculateAverageSurveyScore(surveyData);
            if (avgSentiment > 0) {
                if (avgSentiment > 4) {
                    insights.push(`High user satisfaction with average survey score of ${avgSentiment.toFixed(1)} out of 5.`);
                } else if (avgSentiment > 3) {
                    insights.push(`Average user satisfaction with survey score of ${avgSentiment.toFixed(1)} out of 5.`);
                } else {
                    insights.push(`Opportunity to improve user satisfaction (current average score is ${avgSentiment.toFixed(1)} out of 5).`);
                }
            }
        }

        if (userData && companyData && userData.length > 0 && companyData.length > 0) {
            // Company distribution insights
            insights.push(`Users are distributed across ${companyData.length} different companies.`);

            // Average users per company
            const avgUsersPerCompany = userData.length / companyData.length;
            insights.push(`Average of ${avgUsersPerCompany.toFixed(1)} users per company.`);
        }

        // If we don't have enough insights, add generic ones
        if (insights.length < 3) {
            insights.push("Further analysis recommended to identify growth opportunities.");
            insights.push("Consider segmenting users for more targeted engagement strategies.");
            insights.push("Regular data tracking will help measure platform adoption over time.");
        }

        return insights;
    }

    // Helper to calculate average survey score
    function calculateAverageSurveyScore(surveyData) {
        let totalScore = 0;
        let countScores = 0;

        surveyData.forEach(response => {
            // Look for fields that might contain scores
            Object.keys(response).forEach(key => {
                if (key.endsWith('_score') && !isNaN(response[key])) {
                    totalScore += Number(response[key]);
                    countScores++;
                }
            });
        });

        return countScores > 0 ? totalScore / countScores : 0;
    }

    // Prepare user engagement data for chart
    function prepareUserEngagementData(userData) {
        if (!userData || userData.length === 0) {
            return [];
        }

        const sessions = userData.map(user => Number(user.web_sessions) || 0);

        // Create engagement categories
        const categories = [
            { min: 0, max: 0, label: '0 sessions' },
            { min: 1, max: 1, label: '1 session' },
            { min: 2, max: 5, label: '2-5 sessions' },
            { min: 6, max: 10, label: '6-10 sessions' },
            { min: 11, max: 20, label: '11-20 sessions' },
            { min: 21, max: Infinity, label: '21+ sessions' }
        ];

        // Count users in each category
        const categoryCounts = categories.map(category => {
            const count = sessions.filter(session =>
                session >= category.min && session <= category.max
            ).length;

            const percentage = (count / userData.length) * 100;

            return {
                label: category.label,
                count,
                percentage
            };
        });

        return categoryCounts;
    }

    // Prepare survey response data for chart
    function prepareSurveyResponseData(surveyData) {
        if (!surveyData || surveyData.length === 0) {
            return [];
        }

        // Group by survey
        const surveyGroups = {};

        surveyData.forEach(response => {
            const surveyId = response.survey_id;
            const surveyName = response.survey_name || `Survey ${surveyId}`;

            if (!surveyGroups[surveyId]) {
                surveyGroups[surveyId] = {
                    label: surveyName,
                    count: 0
                };
            }

            surveyGroups[surveyId].count++;
        });

        // Convert to array and calculate percentages
        const surveyArray = Object.values(surveyGroups);

        surveyArray.forEach(survey => {
            survey.percentage = (survey.count / surveyData.length) * 100;
        });

        // Sort by count descending
        return surveyArray.sort((a, b) => b.count - a.count);
    }

    // Prepare company distribution data for chart
    function prepareCompanyDistributionData(userData, companyData) {
        if (!userData || !companyData || userData.length === 0 || companyData.length === 0) {
            return [];
        }

        // Count users per company
        const companyUserCount = {};

        userData.forEach(user => {
            if (user.company_id) {
                companyUserCount[user.company_id] = (companyUserCount[user.company_id] || 0) + 1;
            }
        });

        // Create company data array
        const companyArray = Object.keys(companyUserCount).map(companyId => {
            // Find company name if available
            const company = companyData.find(c => c.id === companyId || c.company_id === companyId);
            const companyName = company ? (company.name || `Company ${companyId}`) : `Company ${companyId}`;

            return {
                id: companyId,
                label: companyName,
                count: companyUserCount[companyId],
                percentage: (companyUserCount[companyId] / userData.length) * 100
            };
        });

        // Sort by count descending
        return companyArray.sort((a, b) => b.count - a.count);
    }

    // Generate conic gradient for pie chart
    function generateConicGradient(companyData) {
        if (!companyData || companyData.length === 0) {
            return '#f0f0f0';
        }

        // Take top 5 companies, group the rest as "Others"
        const top5 = companyData.slice(0, 5);
        const others = companyData.slice(5);

        // Calculate total percentage for "Others"
        const othersPercentage = others.reduce((sum, company) => sum + company.percentage, 0);

        // Generate gradient segments
        let startPercentage = 0;
        let gradientParts = [];

        // Add top 5 companies
        top5.forEach((company, index) => {
            const endPercentage = startPercentage + company.percentage;
            gradientParts.push(`${getChartColor(index)} ${startPercentage}% ${endPercentage}%`);
            startPercentage = endPercentage;
        });

        // Add "Others" if needed
        if (othersPercentage > 0) {
            const endPercentage = startPercentage + othersPercentage;
            gradientParts.push(`${getChartColor(5)} ${startPercentage}% ${endPercentage}%`);
        }

        return gradientParts.join(', ');
    }

    // Get chart color by index
    function getChartColor(index) {
        const colors = [
            '#4285f4', // Blue
            '#34a853', // Green
            '#fbbc05', // Yellow
            '#ea4335', // Red
            '#8c44a1', // Purple
            '#666666'  // Gray for "Others"
        ];

        return colors[index % colors.length];
    }

    // Add PDF report generation to the main export function
    async function addPDFReportToExport(exportAnalyticsFunction) {
        // Store the original function
        const originalExportAnalytics = exportAnalyticsFunction;

        // Return a modified function that also generates a PDF report
        return async function exportAnalyticsWithPDF(options) {
            try {
                // Call the original function first
                const result = await originalExportAnalytics(options);

                // Generate PDF report if requested
                if (options.generatePDFReport) {
                    try {
                        // Initialize progress for PDF generation
                        updateProgress(90, "Generating PDF report...");

                        // Get data that was already fetched
                        const { userData, surveyData, companyData, questionMapping } = result.data || {};

                        // Generate the PDF report
                        const pdfFilename = await generatePDFReport(
                            userData,
                            surveyData,
                            companyData,
                            questionMapping,
                            options
                        );

                        // Update success message to include PDF report
                        result.message = `${result.message} PDF report generated: ${pdfFilename}`;
                        result.pdfGenerated = true;

                        updateProgress(100, "PDF report generated!");
                    } catch (error) {
                        console.error('Error generating PDF report:', error);
                        result.pdfError = error.message || "Error generating PDF report";
                    }
                }

                return result;
            } catch (error) {
                console.error('Export error:', error);
                return {
                    status: "error",
                    message: error.message || "Unknown error occurred"
                };
            }
        };
    }
    function integrateReporting() {
        // Check if we're in the UserGuiding panel context
        if (typeof exportAnalytics === 'function') {
            // Replace the original exportAnalytics function with our enhanced version
            window.exportAnalytics = addPDFReportToExport(exportAnalytics);
            console.log('PDF reporting capability added to UserGuiding Analytics Exporter');
        }
    }
    integrateReporting()
}
)();