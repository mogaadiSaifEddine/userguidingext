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
    // Helper function to update export progress
    function updateProgress(percentage, message) {
        // Send a message to the popup script
        try {
            chrome.runtime.sendMessage({
                action: "updateProgress",
                percentage: percentage,
                message: message
            });
        } catch (e) {
            // Ignore errors from disconnected ports
            console.log(`Progress update: ${percentage}% - ${message}`);
        }
    }
    // Main export function
    // Update the exportAnalytics function to include PDF report generation
    // Main export function with pagination progress updates
    async function exportAnalytics(options) {
        try {
            // Get JWT token from localStorage
            const jwt = localStorage.getItem('__ugJWT');
            if (!jwt) {
                throw new Error('JWT token not found. Please make sure you are logged into UserGuiding.');
            }

            // Report initial progress
            updateProgress(5, "Preparing to fetch data...");

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
                    version: "1.0",
                    options: options
                },
                data: {}
            };

            // Fetch survey questions metadata first if we're including surveys
            if (options.includeSurveys || options.mergeUserSurvey || options.mergeAllBySurvey) {
                updateProgress(10, "Fetching survey question metadata...");
                questionMapping = await fetchSurveyQuestions(jwt);

                // Add to master data
                masterData.data.questionMapping = questionMapping;
            }

            // Fetch and export data based on options
            if (options.includeUsers) {
                updateProgress(15, "Fetching users data (this may take a moment for large datasets)...");
                userData = await fetchUsers(jwt, options.limitRows);
                updateProgress(25, `Processed ${userData.length} users`);

                // Process data if anonymization is requested
                if (options.anonymizeData) {
                    updateProgress(26, "Anonymizing user data...");
                    userData = anonymizeUserData(userData);
                }

                // Add to master data
                masterData.data.users = userData;

                // Export Users CSV
                updateProgress(30, "Exporting users data...");
                exportCSV(userData, `UserGuiding_Users_${date}.csv`);
                filesExported++;
            }

            if (options.includeSurveys) {
                updateProgress(35, "Fetching survey responses (this may take a moment for large datasets)...");
                surveyData = await fetchSurveys(jwt, options.limitRows);
                updateProgress(40, `Processed ${surveyData.length} survey responses`);

                // Process data if anonymization is requested
                if (options.anonymizeData) {
                    updateProgress(41, "Anonymizing survey data...");
                    surveyData = anonymizeSurveyData(surveyData);
                }

                // Enhance survey data with question text if available
                if (questionMapping) {
                    updateProgress(42, "Enhancing survey data with question metadata...");
                    surveyData = enhanceSurveyDataWithQuestions(surveyData, questionMapping);
                }

                // Add to master data
                masterData.data.surveys = surveyData;

                // Export Surveys CSV
                updateProgress(45, "Exporting survey data...");
                exportCSV(surveyData, `UserGuiding_Surveys_${date}.csv`);
                filesExported++;

                // Export a separate questions reference file for easier analysis
                if (questionMapping && Object.keys(questionMapping).length > 0) {
                    updateProgress(46, "Exporting question reference data...");
                    exportQuestionsReference(questionMapping, `UserGuiding_Questions_Reference_${date}.csv`);
                    filesExported++;
                }
            }

            if (options.includeCompanies) {
                updateProgress(50, "Fetching company data (this may take a moment for large datasets)...");
                companyData = await fetchCompanies(jwt, options.limitRows);
                updateProgress(55, `Processed ${companyData.length} companies`);

                // Process data if anonymization is requested
                if (options.anonymizeData) {
                    updateProgress(56, "Anonymizing company data...");
                    companyData = anonymizeCompanyData(companyData);
                }

                // Add to master data
                masterData.data.companies = companyData;

                // Export Companies CSV
                updateProgress(60, "Exporting company data...");
                exportCSV(companyData, `UserGuiding_Companies_${date}.csv`);
                filesExported++;
            }

            // Create and export merged data
            if (options.mergeUserSurvey) {
                updateProgress(65, "Creating user-survey merged data...");

                // Fetch data if not already fetched
                if (!userData) {
                    updateProgress(66, "Fetching user data for merging...");
                    userData = await fetchUsers(jwt, options.limitRows);
                    if (options.anonymizeData) {
                        userData = anonymizeUserData(userData);
                    }
                }

                if (!surveyData) {
                    updateProgress(67, "Fetching survey data for merging...");
                    surveyData = await fetchSurveys(jwt, options.limitRows);
                    if (options.anonymizeData) {
                        surveyData = anonymizeSurveyData(surveyData);
                    }

                    // Enhance survey data with question text if available
                    if (questionMapping) {
                        surveyData = enhanceSurveyDataWithQuestions(surveyData, questionMapping);
                    }
                }

                updateProgress(68, "Merging user and survey data...");
                const mergedData = mergeUserSurveyData(userData, surveyData);
                updateProgress(70, `Created ${mergedData.length} merged records`);

                // Add to master data
                masterData.data.userSurveyMerged = mergedData;

                // Export merged data
                updateProgress(72, "Exporting user-survey merged data...");
                exportCSV(mergedData, `UserGuiding_Users-Survey_${date}.csv`);
                filesExported++;
            }

            if (options.mergeUserCompany) {
                updateProgress(75, "Creating user-company merged data...");

                // Fetch data if not already fetched
                if (!userData) {
                    updateProgress(76, "Fetching user data for merging...");
                    userData = await fetchUsers(jwt, options.limitRows);
                    if (options.anonymizeData) {
                        userData = anonymizeUserData(userData);
                    }
                }

                if (!companyData) {
                    updateProgress(77, "Fetching company data for merging...");
                    companyData = await fetchCompanies(jwt, options.limitRows);
                    if (options.anonymizeData) {
                        companyData = anonymizeCompanyData(companyData);
                    }
                }

                updateProgress(78, "Merging user and company data...");
                const mergedData = mergeUserCompanyData(userData, companyData);
                updateProgress(79, `Created ${mergedData.length} merged records`);

                // Add to master data
                masterData.data.userCompanyMerged = mergedData;

                // Export merged data
                updateProgress(80, "Exporting user-company merged data...");
                exportCSV(mergedData, `UserGuiding_Users-Company_${date}.csv`);
                filesExported++;
            }

            // Create merged data grouped by survey
            if (options.mergeAllBySurvey) {
                updateProgress(82, "Creating comprehensive survey analysis data...");

                // Fetch data if not already fetched
                if (!userData) {
                    updateProgress(83, "Fetching user data for comprehensive analysis...");
                    userData = await fetchUsers(jwt, options.limitRows);
                    if (options.anonymizeData) {
                        userData = anonymizeUserData(userData);
                    }
                }

                if (!surveyData) {
                    updateProgress(84, "Fetching survey data for comprehensive analysis...");
                    surveyData = await fetchSurveys(jwt, options.limitRows);
                    if (options.anonymizeData) {
                        surveyData = anonymizeSurveyData(surveyData);
                    }

                    // Enhance survey data with question text if available
                    if (questionMapping) {
                        surveyData = enhanceSurveyDataWithQuestions(surveyData, questionMapping);
                    }
                }

                if (!companyData) {
                    updateProgress(85, "Fetching company data for comprehensive analysis...");
                    companyData = await fetchCompanies(jwt, options.limitRows);
                    if (options.anonymizeData) {
                        companyData = anonymizeCompanyData(companyData);
                    }
                }

                updateProgress(86, "Merging all data sources...");
                const allMergedData = mergeAllDataBySurvey(userData, companyData, surveyData, questionMapping);
                updateProgress(87, `Created ${allMergedData.length} comprehensive survey records`);

                // Add to master data
                masterData.data.allDataBySurvey = allMergedData;

                // Export the combined data
                updateProgress(88, "Exporting comprehensive survey analysis data...");
                exportCSV(allMergedData, `UserGuiding_SurveyAnalysis_${date}.csv`);
                filesExported++;
            }

            // Export the combined JSON data - optimize it first
            updateProgress(90, "Creating combined JSON export...");
            const optimizedData = optimizeJsonForExport(masterData);
            exportJSON(optimizedData, `UserGuiding_Complete_Export_${date}.json`);
            filesExported++;

            // Generate PDF report if requested
            if (options.includePdfReport) {
                updateProgress(92, "Generating PDF analytics report with ad planning insights...");
                generatePdfReport(optimizedData);
                // Note: No need to track file export count as this prints directly
            }

            // Export a README file with analysis instructions
            if (options.includeGuide) {
                updateProgress(95, "Creating analysis instructions...");
                exportAnalysisInstructions(date, !!questionMapping);
                filesExported++;
            }

            // Create data preview if requested
            if (options.includePreview && (userData || surveyData || companyData)) {
                updateProgress(98, "Generating data preview...");
                showDataPreview(userData, surveyData, companyData, questionMapping);
            }

            updateProgress(100, "Export complete!");

            // Return success
            return {
                status: "success",
                message: `Successfully exported ${filesExported} files with complete data (${userData ? userData.length : 0} users, ${surveyData ? surveyData.length : 0} survey responses, ${companyData ? companyData.length : 0} companies).`
            };

        } catch (error) {
            console.error('Export error:', error);
            return {
                status: "error",
                message: error.message || "Unknown error occurred"
            };
        }
    }

    // Helper function to optimize JSON data for export
    function optimizeJsonForExport(masterData) {
        // Create a deep copy to avoid modifying the original
        const optimized = JSON.parse(JSON.stringify(masterData));

        // Add metadata about export size
        optimized.metadata.exportSummary = {};

        // Count and optimize each data type
        for (const dataType in optimized.data) {
            const dataset = optimized.data[dataType];

            if (Array.isArray(dataset)) {
                // Add count to metadata
                optimized.metadata.exportSummary[dataType] = {
                    recordCount: dataset.length
                };

                // For very large datasets, consider strategies to reduce size
                if (dataset.length > 1000) {
                    // Strategy 1: Remove duplicate fields across joined datasets
                    if (dataType === 'userSurveyMerged' || dataType === 'userCompanyMerged' || dataType === 'allDataBySurvey') {
                        // Already optimized through our merge functions
                    }

                    // Strategy 2: Convert repeated string values to codes for massive datasets
                    if (dataset.length > 5000) {
                        // Find fields with many repeated values (like browser_name, device_type)
                        const commonFields = ['browser_name', 'device_type', 'os_name', 'device_vendor'];

                        commonFields.forEach(field => {
                            const valueMap = {};
                            let codeCounter = 1;

                            // Check if this field exists in the dataset
                            if (dataset[0] && dataset[0][field] !== undefined) {
                                // Build value mapping
                                dataset.forEach(record => {
                                    const value = record[field];
                                    if (value && !valueMap[value]) {
                                        valueMap[value] = codeCounter++;
                                    }
                                });

                                // If we have a significant number of records but few unique values
                                if (Object.keys(valueMap).length < dataset.length / 10) {
                                    // Store the mapping in metadata
                                    optimized.metadata.exportSummary[dataType][`${field}_mapping`] = valueMap;

                                    // Replace values with codes
                                    dataset.forEach(record => {
                                        const value = record[field];
                                        if (value && valueMap[value]) {
                                            record[field] = valueMap[value];
                                        }
                                    });
                                }
                            }
                        });
                    }
                }
            }
        }

        // Add timestamp and version info for data traceability
        optimized.metadata.optimizationApplied = true;
        optimized.metadata.exportTimestamp = new Date().toISOString();

        return optimized;
    }

    // Helper function to export JSON
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

    // Helper function to fetch survey questions metadata
    // Helper function to fetch responses for a specific survey with pagination
    async function fetchSurveyResponsesWithPagination(jwt, surveyId, questionMapping) {
        try {
            // Make initial request to get total count
            const initialBody = {
                "survey_id": surveyId,
                "page_size": 20,
                "page": 0,
                "start_date": "2024-01-01T00:00:00.000Z", // Last year
                "end_date": new Date().toISOString()
            };

            const initialResponse = await fetch("https://uapi.userguiding.com/panel/survey-responses", {
                headers: {
                    "accept": "application/json",
                    "content-type": "application/json",
                    "ug-api-token": jwt
                },
                body: JSON.stringify(initialBody),
                method: "POST"
            });

            if (!initialResponse.ok) {
                console.warn(`Failed to fetch responses for survey ${surveyId}: ${initialResponse.status}`);
                return;
            }

            const initialData = await initialResponse.json();
            const totalResponses = initialData.count || 0;

            // If no responses or we already have the questions, we can skip pagination
            if (totalResponses <= initialBody.page_size) {
                return;
            }

            // Calculate how many pages we need to fetch
            const pageSize = initialBody.page_size;
            const totalPages = Math.ceil(totalResponses / pageSize);

            // We already processed page 0 for questions, so start from page 1
            for (let page = 1; page < totalPages; page++) {
                // Only log for many pages to avoid console spam
                if (totalPages > 5 && page % 5 === 0) {
                    console.log(`Fetching responses for survey ${surveyId}, page ${page}/${totalPages}...`);
                }

                const pageBody = {
                    ...initialBody,
                    page: page
                };

                const pageResponse = await fetch("https://uapi.userguiding.com/panel/survey-responses", {
                    headers: {
                        "accept": "application/json",
                        "content-type": "application/json",
                        "ug-api-token": jwt
                    },
                    body: JSON.stringify(pageBody),
                    method: "POST"
                });

                if (!pageResponse.ok) {
                    console.warn(`Failed to fetch responses for survey ${surveyId} page ${page}: ${pageResponse.status}`);
                    continue; // Skip this page but continue with others
                }

                const pageData = await pageResponse.json();

                // We don't need to store all responses here, we just need to process them for question mapping
                if (pageData.questions && Array.isArray(pageData.questions)) {
                    pageData.questions.forEach(question => {
                        const questionId = question.id;
                        // Skip if we already have this question
                        if (questionMapping[questionId]) {
                            return;
                        }

                        const questionText = question.text || 'Unnamed Question';

                        // Store in our mapping
                        questionMapping[questionId] = {
                            survey_id: surveyId,
                            survey_name: pageData.survey?.name || `Survey ${surveyId}`,
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
        } catch (error) {
            console.warn(`Error fetching responses for survey ${surveyId}:`, error);
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
    // Enhanced fetching functions with pagination support

    // Helper function to fetch Users data with pagination
    async function fetchUsers(jwt, limitRows = false) {
        try {
            // First make an initial request to get total count
            const initialBody = {
                page: 0,
                page_size: 20,
                filter_operator: "AND",
                sort_field: "last_seen",
                sort_order: "desc",
                filters: [{
                    filter_operator: "OR",
                    children: [{
                        custom: false,
                        equation: "5",
                        event: false,
                        format: "date",
                        type: "last_seen",
                        value: 30 // Get users from last 30 days
                    }]
                }]
            };

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
                throw new Error(`Failed to fetch users: ${initialResponse.status} ${initialResponse.statusText}`);
            }

            const initialData = await initialResponse.json();
            const totalUsers = initialData.filtered_users_count || 0;

            // If we only want the first page or there's nothing more to fetch
            if (limitRows || totalUsers <= initialBody.page_size) {
                return processUsers(initialData.users || []);
            }

            // Calculate how many pages we need to fetch
            const pageSize = initialBody.page_size;
            const totalPages = Math.ceil(totalUsers / pageSize);

            // We already have page 0, so start from page 1
            const allUsers = [...(initialData.users || [])];

            // Fetch remaining pages
            for (let page = 1; page < totalPages; page++) {
                // Create a status update message if we have many pages
                if (totalPages > 5 && page % 5 === 0) {
                    console.log(`Fetching users page ${page}/${totalPages}...`);
                }

                const pageBody = {
                    ...initialBody,
                    page: page
                };

                const pageResponse = await fetch("https://uapi.userguiding.com/panel/users", {
                    method: "POST",
                    headers: {
                        "accept": "application/json",
                        "content-type": "application/json",
                        "ug-api-token": jwt
                    },
                    body: JSON.stringify(pageBody)
                });

                if (!pageResponse.ok) {
                    console.warn(`Failed to fetch users page ${page}: ${pageResponse.status}`);
                    continue; // Skip this page but continue with others
                }

                const pageData = await pageResponse.json();
                if (pageData.users && Array.isArray(pageData.users)) {
                    allUsers.push(...pageData.users);
                }

                // If we've reached the row limit, stop fetching
                if (limitRows && allUsers.length >= 1000) {
                    break;
                }
            }

            // Process all users to flatten complex objects
            return processUsers(allUsers);

        } catch (error) {
            console.error('Error in fetchUsers:', error);
            throw error;
        }
    }

    // Helper function to process user data
    function processUsers(users) {
        const processedUsers = [];

        if (users && Array.isArray(users)) {
            users.forEach(user => {
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

        return processedUsers;
    }

    // Helper function to fetch Survey data with pagination
    // Helper function to fetch survey questions metadata with pagination
    async function fetchSurveyQuestions(jwt) {
        try {
            // Get all surveys first
            const surveysResponse = await fetch("https://api.userguiding.com/api/rest/surveys/", {
                "headers": {
                    "accept": "application/json, text/plain, */*",
                    "accept-language": "en,fr;q=0.9,de;q=0.8,fa;q=0.7,fi;q=0.6,en-US;q=0.5,ms;q=0.4,fr-FR;q=0.3,es;q=0.2,en-GB;q=0.1",
                    "Authorization": "JWT eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzQyOTg0MTY5LCJpYXQiOjE3NDIzNzkzNjksImp0aSI6ImJmMzY4YzZmNThhOTQ4Yjg4MGZhYzhjNGFjYjM2NjM3IiwidXNlcl9pZCI6MTAzMTM0fQ.2embRPE1NJKVJZvZqLuR5QHNCjAy088K0dE2DEOy2Ls",
                },
                "referrerPolicy": "strict-origin-when-cross-origin",
                "body": null,
                "method": "GET",
            });

            if (!surveysResponse.ok) {
                console.warn(`Failed to fetch surveys: ${surveysResponse.status} ${surveysResponse.statusText}`);
                return {};
            }

            const surveysData = await surveysResponse.json();
            const surveys = surveysData.surveys || [];

            if (!surveys || !Array.isArray(surveys) || surveys.length === 0) {
                return {};
            }

            // Create a mapping of question IDs to question text
            const questionMapping = {};

            // Process each survey to extract questions
            for (let i = 0; i < surveys.length; i++) {
                const survey = surveys[i];
                const surveyId = survey.id;

                // Log progress for many surveys
                if (surveys.length > 5 && i % 5 === 0) {
                    console.log(`Fetching questions for survey ${i + 1}/${surveys.length}...`);
                    updateProgress(10 + (i / surveys.length) * 5, `Analyzing survey ${i + 1}/${surveys.length}...`);
                }

                // Fetch details for each survey to get questions
                const surveyDetailResponse = await fetch(`https://uapi.userguiding.com/panel/surveys/${surveyId}`, {
                    method: "GET",
                    headers: {
                        "accept": "application/json",
                        "ug-api-token": jwt
                    }
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

                // Now fetch survey responses with pagination to get additional question data
                // This handles the case where some questions might only appear in responses
                // but not in the survey definition
                try {
                    await fetchSurveyResponsesWithPagination(jwt, surveyId, questionMapping);
                } catch (error) {
                    console.warn(`Error processing responses for survey ${surveyId}:`, error);
                    // Continue with other surveys if one fails
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

            console.log(`Completed processing ${Object.keys(questionMapping).length} questions from ${surveys.length} surveys`);
            return questionMapping;

        } catch (error) {
            console.warn('Error fetching survey questions:', error);
            return {}; // Return empty mapping if error occurs
        }
    }

    // Helper function to process survey data
    function processSurveys(responses) {
        const processedResponses = [];

        // Process responses to flatten the data
        if (responses && Array.isArray(responses)) {
            responses.forEach(response => {
                const flatResponse = {
                    response_id: response.id,
                    survey_id: response.survey_id,
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

                processedResponses.push(flatResponse);
            });
        }

        return processedResponses;
    }

    // Helper function to fetch Companies data with pagination
    async function fetchCompanies(jwt, limitRows = false) {
        try {
            // First make an initial request to get total count
            const initialBody = {
                "page": 0,
                "page_size": 20,
                "filter_operator": "AND",
                "sort_field": "last_seen",
                "sort_order": "desc",
                "filters": [{
                    "children": [{
                        "type": "first_seen",
                        "event": false,
                        "value": new Date().getTime() - (365 * 24 * 60 * 60 * 1000), // Last year
                        "custom": false,
                        "format": "date",
                        "equation": "1"
                    }],
                    "filter_operator": "OR"
                }]
            };

            const initialResponse = await fetch("https://uapi.userguiding.com/panel/companies", {
                headers: {
                    "accept": "application/json, text/plain, */*",
                    "content-type": "application/json",
                    "ug-api-token": jwt
                },
                body: JSON.stringify(initialBody),
                method: "POST"
            });

            if (!initialResponse.ok) {
                throw new Error(`Failed to fetch companies: ${initialResponse.status} ${initialResponse.statusText}`);
            }

            const initialData = await initialResponse.json();
            const totalCompanies = initialData.filtered_companies_count || 0;

            // If we only want the first page or there's nothing more to fetch
            if (limitRows || totalCompanies <= initialBody.page_size) {
                return processCompanies(initialData.companies || []);
            }

            // Calculate how many pages we need to fetch
            const pageSize = initialBody.page_size;
            const totalPages = Math.ceil(totalCompanies / pageSize);

            // We already have page 0, so start from page 1
            const allCompanies = [...(initialData.companies || [])];

            // Fetch remaining pages
            for (let page = 1; page < totalPages; page++) {
                // Create a status update message if we have many pages
                if (totalPages > 5 && page % 5 === 0) {
                    console.log(`Fetching companies page ${page}/${totalPages}...`);
                }

                const pageBody = {
                    ...initialBody,
                    page: page
                };

                const pageResponse = await fetch("https://uapi.userguiding.com/panel/companies", {
                    headers: {
                        "accept": "application/json, text/plain, */*",
                        "content-type": "application/json",
                        "ug-api-token": jwt
                    },
                    body: JSON.stringify(pageBody),
                    method: "POST"
                });

                if (!pageResponse.ok) {
                    console.warn(`Failed to fetch companies page ${page}: ${pageResponse.status}`);
                    continue; // Skip this page but continue with others
                }

                const pageData = await pageResponse.json();
                if (pageData.companies && Array.isArray(pageData.companies)) {
                    allCompanies.push(...pageData.companies);
                }

                // If we've reached the row limit, stop fetching
                if (limitRows && allCompanies.length >= 1000) {
                    break;
                }
            }

            // Process all companies
            return processCompanies(allCompanies);

        } catch (error) {
            console.error('Error in fetchCompanies:', error);
            throw error;
        }
    }

    // Helper function to process company data
    function processCompanies(companies) {
        const processedCompanies = [];

        // Process companies to flatten complex objects
        if (companies && Array.isArray(companies)) {
            companies.forEach(company => {
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

        return processedCompanies;
    }

    // Helper function to update export progress

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

    // Helper function to merge Users, Companies, and Survey data, grouped by survey
    function mergeAllDataBySurvey(users, companies, surveys, questionMapping) {
        const mergedData = [];

        if (!surveys || !Array.isArray(surveys) || surveys.length === 0) {
            return mergedData;
        }

        // Create user lookup map for quick access
        const usersById = {};
        if (users && Array.isArray(users)) {
            users.forEach(user => {
                usersById[user.user_id] = user;
            });
        }

        // Create company lookup map for quick access
        const companiesById = {};
        if (companies && Array.isArray(companies)) {
            companies.forEach(company => {
                const companyId = company.id || company.company_id;
                if (companyId) {
                    companiesById[companyId] = company;
                }
            });
        }

        // Extract unique survey IDs
        const surveyIds = new Set();
        surveys.forEach(survey => {
            if (survey.survey_id) {
                surveyIds.add(survey.survey_id);
            }
        });

        // For each survey ID, create a group
        surveyIds.forEach(surveyId => {
            // Get all responses for this survey
            const responsesForSurvey = surveys.filter(survey => survey.survey_id === surveyId);

            // Group further by question if needed
            const surveyName = questionMapping &&
                Object.values(questionMapping).find(q => q.survey_id === surveyId)?.survey_name ||
                `Survey ${surveyId}`;

            // For each response, create an enriched record with user and company data
            responsesForSurvey.forEach(response => {
                const user = usersById[response.user_id];

                if (!user) {
                    // Skip if user not found
                    return;
                }

                const companyId = user.company_id;
                const company = companiesById[companyId];

                // Start building the merged record
                const mergedRecord = {
                    // Survey information
                    survey_id: surveyId,
                    survey_name: surveyName,
                    response_id: response.response_id,
                    response_created: response.created,

                    // User core information
                    user_id: user.user_id,
                    is_anonymous: user.is_anonymous,
                    user_created: user.created,
                    user_first_seen: user.first_seen,
                    user_last_seen: user.last_seen,

                    // User device/browser information
                    browser_name: user.browser_name,
                    browser_version: user.browser_version,
                    device_type: user.device_type,
                    os_name: user.os_name,
                    os_version: user.os_version,

                    // Company information
                    has_company_data: !!company,
                    company_id: companyId || null,
                    company_name: company ? (company.company_name || company.name) : null,
                    company_created: company ? company.created : null
                };

                // Add survey answers - these start with Q prefix
                Object.keys(response).forEach(key => {
                    if (key.startsWith('Q')) {
                        mergedRecord[key] = response[key];

                        // Add question text if available
                        if (key.includes('_') && questionMapping) {
                            const questionId = key.split('_')[0].substring(1); // Remove 'Q' prefix
                            if (questionMapping[questionId]) {
                                const questionInfo = questionMapping[questionId];
                                if (!mergedRecord[`${key}_text`] && questionInfo.question_text) {
                                    mergedRecord[`${key}_text`] = questionInfo.question_text;
                                }
                            }
                        }
                    }
                });

                // Add user activity/interaction data
                const activityFields = [
                    'survey_score', 'survey_feedback', 'web_session',
                    'preview_start', 'preview_complete', 'hotspot_interact',
                    'survey_interaction_times', 'guide_interaction_times',
                    'hotspot_interaction_times', 'survey_responses'
                ];

                activityFields.forEach(field => {
                    if (user[field] !== undefined) {
                        mergedRecord[`user_${field}`] = user[field];
                    }
                });

                mergedData.push(mergedRecord);
            });
        });

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
        if (!data || !data.length) return;
        const exludedItems = [
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
            "survey_interaction_times",
            "guide_interaction_times",
            "hotspot_interaction_times",
            "guide_triggers_count",
            "survey_triggers_count",
            "events_summary",
            "goal_reached_times",
            "ai_message_limit_exceeded",
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
            "survey_interaction_times",
            "guide_interaction_times",
            "hotspot_interaction_times",
            "guide_triggers_count",
            "survey_triggers_count",
            "events_summary",
            "goal_reached_times",
            "ai_message_limit_exceeded",
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
            "survey_interaction_times",
            "guide_interaction_times",
            "hotspot_interaction_times",
            "guide_triggers_count",
            "survey_triggers_count",
            "events_summary",
            "goal_reached_times",
            "ai_message_limit_exceeded",
            "company_company_attributes",
            "company_company_ab_test_attributes",
            "browser_name",
            "browser_version",
            "device_type",
            "os_name",
            "os_version",
            "user_survey_score",
            "user_survey_feedback",
            "user_web_session",
            "user_preview_start",
            "user_preview_complete",
            "user_hotspot_interact",
            "user_survey_interaction_times",
            "user_guide_interaction_times",
            "user_hotspot_interaction_times",
            "user_survey_responses",
            "has_company_data", "company_attributes",
            "company_ab_test_attributes",
            "survey_responses",
            "source",
            "survey_feedback"
            , "survey_responses"
        ]    // Get headers from first object
        const headers = Object.keys(data[0]).filter((el) => !exludedItems.includes(el))

        // Create CSV content
        let csvContent = headers.join(',') + '\n';

        // Add data rows
        data.forEach(item => {
            const row = headers.map(header => {
                const value = item[header];
                // Handle different data types
                if (value === null || value === undefined) {
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

    // Helper function to export analysis instructions
    function exportAnalysisInstructions(date, hasQuestionData) {
        const content = `# UserGuiding Analytics Export - Analysis Guide
Date: ${date}

## Overview
This export contains UserGuiding analytics data in various CSV files for comprehensive analysis. Below is a guide on how to use these files.

## File Descriptions

### UserGuiding_Users_${date}.csv
- Contains user profile data, activity metrics, and behavioral information
- Key fields: user_id, first_seen, last_seen, browser information, device details
- Use for user segmentation and behavior analysis

### UserGuiding_Surveys_${date}.csv
- Contains survey responses from users
- Links to users via user_id
- Question IDs are in format Q{id}_choices, Q{id}_feedback, Q{id}_score
${hasQuestionData ? '- See UserGuiding_Questions_Reference_' + date + '.csv for question text mapping' : ''}

### UserGuiding_Companies_${date}.csv
- Contains company profile data and company-level metrics
- Links to users via company_id
- Use for account-level analysis and segmentation

### UserGuiding_Users-Survey_${date}.csv
- Merged dataset combining user profiles with their survey responses
- Each row represents one survey response with associated user data
- Useful for analyzing how user characteristics correlate with survey responses

### UserGuiding_Users-Company_${date}.csv
- Merged dataset combining user profiles with their company information
- Each row represents one user with their associated company data
- Useful for analyzing user behavior in the context of their organization

### UserGuiding_SurveyAnalysis_${date}.csv
- Comprehensive analysis dataset that combines users, companies, and surveys
- Grouped by survey responses
- Each row contains a survey response enriched with user and company data
- Perfect for in-depth analysis of survey results across different dimensions
- Includes question text when available for easier interpretation

${hasQuestionData ? '### UserGuiding_Questions_Reference_' + date + '.csv\n- Reference table mapping question IDs to actual question text\n- Use to understand what each question ID represents in survey responses\n- Includes question types and multiple-choice options when available' : ''}

### UserGuiding_Complete_Export_${date}.json
- Complete export of all data in JSON format
- Use for programmatic analysis or when CSV format is not sufficient
- Contains all relationships between datasets

## Recommended Analysis Approaches

1. **User Engagement Analysis**
- Use UserGuiding_Users_${date}.csv
- Analyze metrics like web_session, guide_interaction_times, survey_responses
- Segment users by browser, device, or geography

2. **Survey Response Analysis**
- Use UserGuiding_Surveys_${date}.csv or UserGuiding_Users-Survey_${date}.csv
- Analyze response patterns across different questions
- Look for correlations between questions

3. **Company-Level Analysis**
- Use UserGuiding_Companies_${date}.csv or UserGuiding_Users-Company_${date}.csv
- Analyze engagement patterns by company size or industry
- Identify high-performing vs. low-performing accounts

4. **Comprehensive Survey Analysis**
- Use UserGuiding_SurveyAnalysis_${date}.csv
- This combines all data sources for the most comprehensive view
- Analyze how company characteristics and user behavior relate to survey responses
- Perform cohort analysis based on survey responses
- Identify patterns in user feedback across different segments

## Data Handling Tips

1. **Date Fields**
- All dates are in ISO format (YYYY-MM-DDTHH:MM:SS.sssZ)
- Use proper date parsing when analyzing in Excel or BI tools

2. **JSON Fields**
- Some fields contain serialized JSON data (e.g., attributes, events_summary)
- Parse these fields for deeper analysis

3. **Joining Datasets**
- Use user_id to join user data to survey responses
- Use company_id to join company data to users

## Privacy Considerations

- This export may contain personally identifiable information (PII)
- Handle in accordance with your organization's data privacy policies
- Consider using the anonymization option when exporting sensitive data

For questions or support with your analysis, contact your UserGuiding customer success manager.`;

        // Create and download file
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
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

    // Helper function to show data preview
    function showDataPreview(userData, surveyData, companyData, questionMapping) {
        // Create a popup for data preview
        const previewContainer = document.createElement('div');
        previewContainer.style.position = 'fixed';
        previewContainer.style.top = '10%';
        previewContainer.style.left = '10%';
        previewContainer.style.width = '80%';
        previewContainer.style.height = '80%';
        previewContainer.style.background = 'white';
        previewContainer.style.border = '1px solid #ccc';
        previewContainer.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
        previewContainer.style.zIndex = '9999';
        previewContainer.style.padding = '20px';
        previewContainer.style.overflowY = 'auto';
        previewContainer.style.display = 'flex';
        previewContainer.style.flexDirection = 'column';
        previewContainer.style.fontFamily = 'Arial, sans-serif';

        // Add title and close button
        const titleBar = document.createElement('div');
        titleBar.style.display = 'flex';
        titleBar.style.justifyContent = 'space-between';
        titleBar.style.alignItems = 'center';
        titleBar.style.marginBottom = '20px';

        const title = document.createElement('h2');
        title.textContent = 'UserGuiding Analytics Data Preview';
        title.style.margin = '0';

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.style.padding = '5px 10px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.onclick = () => document.body.removeChild(previewContainer);

        titleBar.appendChild(title);
        titleBar.appendChild(closeBtn);
        previewContainer.appendChild(titleBar);

        // Add tabs for each dataset
        const tabsContainer = document.createElement('div');
        tabsContainer.style.display = 'flex';
        tabsContainer.style.marginBottom = '10px';
        tabsContainer.style.borderBottom = '1px solid #ccc';

        const contentContainer = document.createElement('div');
        contentContainer.style.flex = '1';
        contentContainer.style.overflow = 'auto';

        const createTab = (label, isActive = false) => {
            const tab = document.createElement('div');
            tab.textContent = label;
            tab.style.padding = '10px 15px';
            tab.style.cursor = 'pointer';
            tab.style.backgroundColor = isActive ? '#eee' : 'transparent';
            tab.style.borderBottom = isActive ? '2px solid #4285f4' : 'none';
            tab.onclick = () => {
                // Remove active state from all tabs
                Array.from(tabsContainer.children).forEach(child => {
                    child.style.backgroundColor = 'transparent';
                    child.style.borderBottom = 'none';
                });

                // Set active state for this tab
                tab.style.backgroundColor = '#eee';
                tab.style.borderBottom = '2px solid #4285f4';

                // Update content based on selected tab
                updateContent(label);
            };
            return tab;
        };

        // Add tabs based on available data
        const tabs = [];

        if (userData && userData.length > 0) {
            tabs.push(createTab('Users Data', tabs.length === 0));
        }

        if (surveyData && surveyData.length > 0) {
            tabs.push(createTab('Survey Responses', tabs.length === 0));
        }

        if (companyData && companyData.length > 0) {
            tabs.push(createTab('Companies', tabs.length === 0));
        }

        if (userData && surveyData && userData.length > 0 && surveyData.length > 0) {
            tabs.push(createTab('Users + Surveys', tabs.length === 0));
        }

        if (userData && companyData && userData.length > 0 && companyData.length > 0) {
            tabs.push(createTab('Users + Companies', tabs.length === 0));
        }

        if (userData && surveyData && companyData &&
            userData.length > 0 && surveyData.length > 0 && companyData.length > 0) {
            tabs.push(createTab('All Data By Survey', tabs.length === 0));
        }

        // Add tabs to container
        tabs.forEach(tab => tabsContainer.appendChild(tab));
        previewContainer.appendChild(tabsContainer);
        previewContainer.appendChild(contentContainer);

        // Function to update content based on selected tab
        function updateContent(tabName) {
            // Clear previous content
            contentContainer.innerHTML = '';

            let dataToShow = [];
            let title = '';

            // Determine which data to show
            switch (tabName) {
                case 'Users Data':
                    dataToShow = userData.slice(0, 10);
                    title = 'Users Data (First 10 records)';
                    break;
                case 'Survey Responses':
                    dataToShow = surveyData.slice(0, 10);
                    title = 'Survey Responses (First 10 records)';
                    break;
                case 'Companies':
                    dataToShow = companyData.slice(0, 10);
                    title = 'Companies Data (First 10 records)';
                    break;
                case 'Users + Surveys':
                    const mergedSurveyData = mergeUserSurveyData(userData, surveyData);
                    dataToShow = mergedSurveyData.slice(0, 10);
                    title = 'Users + Surveys Merged (First 10 records)';
                    break;
                case 'Users + Companies':
                    const mergedCompanyData = mergeUserCompanyData(userData, companyData);
                    dataToShow = mergedCompanyData.slice(0, 10);
                    title = 'Users + Companies Merged (First 10 records)';
                    break;
                case 'All Data By Survey':
                    const allMergedData = mergeAllDataBySurvey(userData, companyData, surveyData, questionMapping);
                    dataToShow = allMergedData.slice(0, 10);
                    title = 'All Data By Survey (First 10 records)';
                    break;
            }

            // Create title
            const contentTitle = document.createElement('h3');
            contentTitle.textContent = title;
            contentContainer.appendChild(contentTitle);

            // No data message
            if (!dataToShow || dataToShow.length === 0) {
                const noData = document.createElement('p');
                noData.textContent = 'No data available for preview.';
                contentContainer.appendChild(noData);
                return;
            }

            // Create table
            const table = document.createElement('table');
            table.style.width = '100%';
            table.style.borderCollapse = 'collapse';
            table.style.marginTop = '10px';

            // Create header row
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');

            // Get all unique keys from data
            const allKeys = new Set();
            dataToShow.forEach(item => {
                Object.keys(item).forEach(key => allKeys.add(key));
            });

            // Limit columns to first 20 for readability
            const columnsToShow = Array.from(allKeys).slice(0, 20);

            // Add headers
            columnsToShow.forEach(key => {
                const th = document.createElement('th');
                th.textContent = key;
                th.style.padding = '8px';
                th.style.backgroundColor = '#f2f2f2';
                th.style.borderBottom = '1px solid #ddd';
                th.style.textAlign = 'left';
                headerRow.appendChild(th);
            });

            thead.appendChild(headerRow);
            table.appendChild(thead);

            // Create body rows
            const tbody = document.createElement('tbody');

            dataToShow.forEach(item => {
                const row = document.createElement('tr');

                columnsToShow.forEach(key => {
                    const td = document.createElement('td');
                    let value = item[key];

                    // Format value for display
                    if (value === null || value === undefined) {
                        value = '';
                    } else if (typeof value === 'object') {
                        try {
                            value = JSON.stringify(value).substr(0, 50) + '...';
                        } catch (e) {
                            value = '[Object]';
                        }
                    } else if (typeof value === 'string' && value.length > 50) {
                        value = value.substr(0, 50) + '...';
                    }

                    td.textContent = value;
                    td.style.padding = '8px';
                    td.style.borderBottom = '1px solid #ddd';
                    row.appendChild(td);
                });

                tbody.appendChild(row);
            });

            table.appendChild(tbody);
            contentContainer.appendChild(table);

            // Add note about limited columns if necessary
            if (allKeys.size > 20) {
                const note = document.createElement('p');
                note.textContent = `Note: Showing only 20 of ${allKeys.size} columns for readability.`;
                note.style.marginTop = '10px';
                note.style.fontStyle = 'italic';
                contentContainer.appendChild(note);
            }

            // Add sample code for analysis
            const codeSection = document.createElement('div');
            codeSection.style.marginTop = '20px';
            codeSection.style.padding = '15px';
            codeSection.style.backgroundColor = '#f8f9fa';
            codeSection.style.borderRadius = '4px';

            const codeTitle = document.createElement('h4');
            codeTitle.textContent = 'Sample Analysis Code (R or Python)';
            codeTitle.style.marginTop = '0';

            const codeExamples = document.createElement('div');
            codeExamples.style.display = 'flex';
            codeExamples.style.gap = '20px';

            // Python example
            const pythonCode = document.createElement('div');
            pythonCode.style.flex = '1';

            const pythonTitle = document.createElement('h5');
            pythonTitle.textContent = 'Python (pandas)';

            const pythonPre = document.createElement('pre');
            pythonPre.style.backgroundColor = '#eef';
            pythonPre.style.padding = '10px';
            pythonPre.style.overflow = 'auto';
            pythonPre.style.fontSize = '12px';

            const fileName = tabName.replace(/ /g, '').replace(/\+/g, '_') + '.csv';
            pythonPre.textContent = `import pandas as pd
import matplotlib.pyplot as plt

# Load the data
df = pd.read_csv("UserGuiding_${fileName}")

# Basic statistics
print(df.describe())

# Check for missing values
print(df.isnull().sum())

# If working with dates, convert them
if 'created' in df.columns:
df['created'] = pd.to_datetime(df['created'])

# Sample analysis (customize based on the data)
if '${tabName}' == 'All Data By Survey':
# Group by survey and count responses
survey_counts = df.groupby(['survey_id', 'survey_name']).size().reset_index(name='response_count')
print(survey_counts)

# Plot responses by survey
plt.figure(figsize=(10, 6))
plt.bar(survey_counts['survey_name'], survey_counts['response_count'])
plt.xticks(rotation=45, ha='right')
plt.title('Number of Responses by Survey')
plt.tight_layout()
plt.show()`;

            pythonCode.appendChild(pythonTitle);
            pythonCode.appendChild(pythonPre);

            // R example
            const rCode = document.createElement('div');
            rCode.style.flex = '1';

            const rTitle = document.createElement('h5');
            rTitle.textContent = 'R';

            const rPre = document.createElement('pre');
            rPre.style.backgroundColor = '#fee';
            rPre.style.padding = '10px';
            rPre.style.overflow = 'auto';
            rPre.style.fontSize = '12px';

            rPre.textContent = `library(tidyverse)
library(lubridate)

# Load the data
data <- read_csv("UserGuiding_${fileName}")

# Basic summary
summary(data)

# Check for missing values
colSums(is.na(data))

# If working with dates, convert them
if("created" %in% colnames(data)) {
data <- data %>% mutate(created = ymd_hms(created))
}

# Sample analysis (customize based on the data)
if("${tabName}" == "All Data By Survey") {
# Group by survey and count responses
survey_counts <- data %>%
group_by(survey_id, survey_name) %>%
summarise(response_count = n(), .groups = "drop")

print(survey_counts)

# Plot responses by survey
ggplot(survey_counts, aes(x = survey_name, y = response_count)) +
geom_bar(stat = "identity", fill = "steelblue") +
theme_minimal() +
theme(axis.text.x = element_text(angle = 45, hjust = 1)) +
labs(title = "Number of Responses by Survey",
     x = "Survey", y = "Response Count")
}`;

            rCode.appendChild(rTitle);
            rCode.appendChild(rPre);

            codeExamples.appendChild(pythonCode);
            codeExamples.appendChild(rCode);

            codeSection.appendChild(codeTitle);
            codeSection.appendChild(codeExamples);

            contentContainer.appendChild(codeSection);
        }

        // Initialize with first tab's content
        if (tabs.length > 0) {
            updateContent(tabs[0].textContent);
        }

        // Add preview to page
        document.body.appendChild(previewContainer);
    }
    // Function to generate PDF report using HTML-to-print approach (no third-party libraries)
    function generatePdfReport(data, filename) {
        try {
            // Create a hidden iframe to hold the report content
            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = '0';
            iframe.onload = function () {
                setTimeout(() => {
                    // Once the iframe is loaded, write the report content
                    const doc = iframe.contentDocument || iframe.contentWindow.document;
                    doc.open();
                    doc.write(generateReportHTML(data));
                    doc.close();

                    // Add print trigger with a slight delay to ensure styles are loaded
                    setTimeout(() => {
                        iframe.contentWindow.print();

                        // Remove the iframe after printing
                        setTimeout(() => {
                            if (iframe && iframe.parentNode) {
                                iframe.parentNode.removeChild(iframe);
                            }
                        }, 1000);
                    }, 500);
                }, 100);
            };

            document.body.appendChild(iframe);
            return true;
        } catch (error) {
            console.error('Error generating PDF report:', error);
            return false;
        }
    }

    // Generate the HTML content for the report
    function generateReportHTML(data) {
        // Get analyzed data
        const userAnalytics = data.data.users ? analyzeUserData(data.data.users) : null;
        const surveyAnalytics = data.data.surveys ? analyzeSurveyData(data.data.surveys, data.data.questionMapping || {}) : null;
        const companyAnalytics = data.data.companies ? analyzeCompanyData(data.data.companies, data.data.users || []) : null;
        const crossAnalytics = data.data.allDataBySurvey ? analyzeCrossData(data.data.allDataBySurvey) : null;

        // Generate insights and recommendations
        const insights = generateInsights(data);
        const recommendations = generateRecommendations(data);

        // Helper function to create data tables
        const createTable = (headers, rows) => {
            let tableHTML = '<table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">';

            // Add headers
            if (headers && headers.length > 0) {
                tableHTML += '<thead><tr style="background-color: #4285f4; color: white;">';
                headers.forEach(header => {
                    tableHTML += `<th>${header}</th>`;
                });
                tableHTML += '</tr></thead>';
            }

            // Add rows
            if (rows && rows.length > 0) {
                tableHTML += '<tbody>';
                rows.forEach((row, index) => {
                    const rowStyle = index % 2 === 0 ? 'background-color: #f8f9fa;' : 'background-color: white;';
                    tableHTML += `<tr style="${rowStyle}">`;
                    row.forEach(cell => {
                        tableHTML += `<td>${cell}</td>`;
                    });
                    tableHTML += '</tr>';
                });
                tableHTML += '</tbody>';
            }

            tableHTML += '</table>';
            return tableHTML;
        };

        // Start building the HTML content
        let html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>UserGuiding Analytics Report</title>
        <style>
            @media print {
                @page {
                    size: letter portrait;
                    margin: 0.5in;
                }
                
                body {
                    font-family: Arial, sans-serif;
                    line-height: 1.5;
                    color: #333;
                }
                
                h1 {
                    color: #4285f4;
                    font-size: 24px;
                    text-align: center;
                    margin-bottom: 5px;
                }
                
                h2 {
                    color: #4285f4;
                    font-size: 18px;
                    margin-top: 20px;
                    padding-bottom: 5px;
                    border-bottom: 1px solid #ddd;
                }
                
                h3 {
                    color: #5f6368;
                    font-size: 16px;
                    margin-top: 15px;
                    margin-bottom: 10px;
                }
                
                .date {
                    text-align: center;
                    color: #666;
                    font-size: 14px;
                    margin-bottom: 20px;
                }
                
                .page-break {
                    page-break-after: always;
                }
                
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 15px 0;
                }
                
                th {
                    background-color: #4285f4;
                    color: white;
                    text-align: left;
                    padding: 8px;
                }
                
                td {
                    padding: 8px;
                    border: 1px solid #ddd;
                }
                
                tr:nth-child(even) {
                    background-color: #f8f9fa;
                }
                
                .insights {
                    background-color: #e8f0fe;
                    padding: 15px;
                    border-radius: 4px;
                    margin: 15px 0;
                }
                
                .recommendations {
                    background-color: #e6f4ea;
                    padding: 15px;
                    border-radius: 4px;
                    margin: 15px 0;
                }
                
                .footer {
                    text-align: center;
                    font-size: 12px;
                    color: #999;
                    margin-top: 30px;
                }
            }
        </style>
    </head>
    <body>
        <h1>UserGuiding Analytics Report</h1>
        <p class="date">Generated on: ${new Date().toLocaleString()}</p>
        
        <h2>Export Summary</h2>`;

        // Add dataset summary
        const datasetRows = [];
        for (const key in data.data) {
            if (Array.isArray(data.data[key]) && data.data[key].length > 0) {
                datasetRows.push([
                    formatDatasetName(key),
                    data.data[key].length.toLocaleString()
                ]);
            }
        }

        html += createTable(['Dataset', 'Records'], datasetRows);

        // Add user analytics if available
        if (userAnalytics) {
            html += `
        <div class="page-break"></div>
        <h2>User Analytics</h2>
        
        <h3>User Devices</h3>`;

            const deviceRows = Object.entries(userAnalytics.deviceTypes)
                .map(([type, count]) => [type, count.toString()]);
            html += createTable(['Device Type', 'Count'], deviceRows);

            html += `<h3>Browsers</h3>`;
            const browserRows = Object.entries(userAnalytics.browsers)
                .map(([browser, count]) => [browser, count.toString()]);
            html += createTable(['Browser', 'Count'], browserRows);

            html += `<h3>Operating Systems</h3>`;
            const osRows = Object.entries(userAnalytics.operatingSystems)
                .map(([os, count]) => [os, count.toString()]);
            html += createTable(['OS', 'Count'], osRows);

            html += `<h3>User Engagement</h3>`;
            const engagementRows = [
                ['Total Users', userAnalytics.totalUsers.toString()],
                ['Avg. Web Sessions per User', userAnalytics.avgWebSessions.toFixed(2)],
                ['Avg. Guide Interactions', userAnalytics.avgGuideInteractions.toFixed(2)],
                ['Avg. Survey Interactions', userAnalytics.avgSurveyInteractions.toFixed(2)]
            ];
            html += createTable(['Metric', 'Value'], engagementRows);
        }

        // Add survey analytics if available
        if (surveyAnalytics) {
            html += `
        <div class="page-break"></div>
        <h2>Survey Analytics</h2>
        
        <h3>Survey Responses</h3>`;

            const surveyRows = Object.entries(surveyAnalytics.surveyResponses)
                .map(([surveyId, count]) => [
                    surveyAnalytics.surveyNames[surveyId] || `Survey ${surveyId}`,
                    count.toString()
                ]);
            html += createTable(['Survey', 'Responses'], surveyRows);

            // Add question response distribution for top questions
            if (surveyAnalytics.questionChoices && Object.keys(surveyAnalytics.questionChoices).length > 0) {
                html += `<h3>Top Question Response Distribution</h3>`;

                // Get top 3 questions with most varied answers
                const topQuestions = Object.keys(surveyAnalytics.questionChoices)
                    .sort((a, b) => Object.keys(surveyAnalytics.questionChoices[b]).length -
                        Object.keys(surveyAnalytics.questionChoices[a]).length)
                    .slice(0, 3);

                topQuestions.forEach(questionId => {
                    const questionText = surveyAnalytics.questionTexts[questionId] || `Question ${questionId}`;
                    const choices = surveyAnalytics.questionChoices[questionId];

                    html += `<h4>${questionText}</h4>`;

                    const choiceRows = Object.entries(choices)
                        .map(([choice, count]) => [choice, count.toString()]);
                    html += createTable(['Response', 'Count'], choiceRows);
                });
            }
        }

        // Add company analytics if available
        if (companyAnalytics) {
            html += `
        <div class="page-break"></div>
        <h2>Company Analytics</h2>
        
        <h3>Company Overview</h3>`;

            const companySummaryRows = [
                ['Total Companies', companyAnalytics.totalCompanies.toString()],
                ['Avg. Users per Company', companyAnalytics.avgUsersPerCompany.toFixed(2)],
                ['Companies with Activity', companyAnalytics.activeCompanies.toString()],
                ['Most Active Company', companyAnalytics.mostActiveCompany.name]
            ];
            html += createTable(['Metric', 'Value'], companySummaryRows);

            html += `<h3>Top Companies by User Count</h3>`;

            // Get top 10 companies by user count
            const topCompaniesByUsers = companyAnalytics.companiesByUserCount
                .sort((a, b) => b.userCount - a.userCount)
                .slice(0, 10);

            const topCompaniesRows = topCompaniesByUsers.map(company => [
                company.name,
                company.userCount.toString()
            ]);
            html += createTable(['Company', 'Users'], topCompaniesRows);
        }

        // Add cross-analytics if available
        if (crossAnalytics) {
            html += `
        <div class="page-break"></div>
        <h2>Comprehensive Survey Analysis</h2>
        
        <h3>Survey Responses by Device Type</h3>`;

            const deviceResponseRows = Object.entries(crossAnalytics.responsesByDevice)
                .map(([device, count]) => [device, count.toString()]);
            html += createTable(['Device Type', 'Response Count'], deviceResponseRows);

            html += `<h3>Survey Responses by Browser</h3>`;

            const browserResponseRows = Object.entries(crossAnalytics.responsesByBrowser)
                .map(([browser, count]) => [browser, count.toString()]);
            html += createTable(['Browser', 'Response Count'], browserResponseRows);

            if (crossAnalytics.responsesByCompanySize && Object.keys(crossAnalytics.responsesByCompanySize).length > 0) {
                html += `<h3>Survey Responses by Company Size</h3>`;

                const companySizeRows = Object.entries(crossAnalytics.responsesByCompanySize)
                    .map(([size, count]) => [`${size} users`, count.toString()]);
                html += createTable(['Company Size', 'Response Count'], companySizeRows);
            }
        }

        // Add insights and recommendations
        html += `
    <div class="page-break"></div>
    <h2>Summary and Recommendations</h2>
    
    <h3>Key Insights</h3>
    <div class="insights">
        <ul>`;

        insights.forEach(insight => {
            html += `<li>${insight}</li>`;
        });

        html += `
        </ul>
    </div>
    
    <h3>Next Steps</h3>
    <div class="recommendations">
        <ul>`;

        recommendations.forEach(recommendation => {
            html += `<li>${recommendation}</li>`;
        });

        html += `
        </ul>
    </div>
    
    <div class="footer">
        <p>UserGuiding Analytics Report | Generated ${new Date().toLocaleDateString()}</p>
    </div>
    
    </body>
    </html>`;

        return html;
    }

    // Helper function to format dataset names for display
    function formatDatasetName(key) {
        switch (key) {
            case 'users':
                return 'Users';
            case 'surveys':
                return 'Survey Responses';
            case 'companies':
                return 'Companies';
            case 'userSurveyMerged':
                return 'Users + Surveys';
            case 'userCompanyMerged':
                return 'Users + Companies';
            case 'allDataBySurvey':
                return 'Comprehensive Survey Data';
            case 'questionMapping':
                return 'Survey Questions';
            default:
                return key.replace(/([A-Z])/g, ' $1').trim();
        }
    }
    // Function to analyze user data
    function analyzeUserData(users) {
        const analysis = {
            totalUsers: users.length,
            deviceTypes: {},
            browsers: {},
            operatingSystems: {},
            avgWebSessions: 0,
            avgGuideInteractions: 0,
            avgSurveyInteractions: 0
        };

        // Calculate totals
        let totalSessions = 0;
        let totalGuideInteractions = 0;
        let totalSurveyInteractions = 0;

        users.forEach(user => {
            // Count device types
            const deviceType = user.device_type || 'Unknown';
            if (!analysis.deviceTypes[deviceType]) {
                analysis.deviceTypes[deviceType] = 0;
            }
            analysis.deviceTypes[deviceType]++;

            // Count browsers
            const browser = user.browser_name || 'Unknown';
            if (!analysis.browsers[browser]) {
                analysis.browsers[browser] = 0;
            }
            analysis.browsers[browser]++;

            // Count operating systems
            const os = user.os_name || 'Unknown';
            if (!analysis.operatingSystems[os]) {
                analysis.operatingSystems[os] = 0;
            }
            analysis.operatingSystems[os]++;

            // Count sessions and interactions
            if (user.web_session) {
                totalSessions += parseInt(user.web_session) || 0;
            }

            // Count guide interactions
            if (user.guide_interaction_times) {
                try {
                    // Try to estimate interactions from the string
                    const interactionStr = user.guide_interaction_times;
                    const interactions = interactionStr.split(';').length;
                    totalGuideInteractions += interactions;
                } catch (e) {
                    // Ignore parsing errors
                }
            }

            // Count survey interactions
            if (user.survey_interaction_times) {
                try {
                    // Try to estimate interactions from the string
                    const interactionStr = user.survey_interaction_times;
                    const interactions = interactionStr.split(';').length;
                    totalSurveyInteractions += interactions;
                } catch (e) {
                    // Ignore parsing errors
                }
            }
        });

        // Calculate averages
        analysis.avgWebSessions = totalSessions / users.length;
        analysis.avgGuideInteractions = totalGuideInteractions / users.length;
        analysis.avgSurveyInteractions = totalSurveyInteractions / users.length;

        return analysis;
    }

    // Function to analyze survey data
    function analyzeSurveyData(surveys, questionMapping) {
        const analysis = {
            surveyResponses: {},
            surveyNames: {},
            questionTexts: {},
            questionChoices: {}
        };

        // Extract survey IDs and their response counts
        surveys.forEach(survey => {
            const surveyId = survey.survey_id;
            if (!analysis.surveyResponses[surveyId]) {
                analysis.surveyResponses[surveyId] = 0;
            }
            analysis.surveyResponses[surveyId]++;

            // Find survey names from question mapping
            if (questionMapping) {
                for (const questionId in questionMapping) {
                    if (questionMapping[questionId].survey_id === surveyId) {
                        analysis.surveyNames[surveyId] = questionMapping[questionId].survey_name;
                        break;
                    }
                }
            }

            // Extract question answers
            Object.keys(survey).forEach(key => {
                if (key.startsWith('Q') && key.includes('_choices')) {
                    const questionId = key.split('_')[0].substring(1);
                    const choices = survey[key].split(';').map(c => c.trim());

                    // Get question text from mapping
                    if (questionMapping && questionMapping[questionId]) {
                        analysis.questionTexts[questionId] = questionMapping[questionId].question_text;
                    }

                    // Count choices
                    if (!analysis.questionChoices[questionId]) {
                        analysis.questionChoices[questionId] = {};
                    }

                    choices.forEach(choice => {
                        if (!analysis.questionChoices[questionId][choice]) {
                            analysis.questionChoices[questionId][choice] = 0;
                        }
                        analysis.questionChoices[questionId][choice]++;
                    });
                }
            });
        });

        return analysis;
    }

    // Function to analyze company data
    function analyzeCompanyData(companies, users) {
        const analysis = {
            totalCompanies: companies.length,
            activeCompanies: 0,
            avgUsersPerCompany: 0,
            mostActiveCompany: { name: 'Unknown', activity: 0 },
            companiesByUserCount: []
        };

        // Map users to companies
        const usersByCompany = {};
        if (users && users.length > 0) {
            users.forEach(user => {
                const companyId = user.company_id;
                if (companyId) {
                    if (!usersByCompany[companyId]) {
                        usersByCompany[companyId] = [];
                    }
                    usersByCompany[companyId].push(user);
                }
            });
        }

        // Analyze each company
        companies.forEach(company => {
            const companyId = company.id || company.company_id;
            const companyName = company.company_name || company.name || `Company ${companyId}`;
            const companyUsers = usersByCompany[companyId] || [];

            // Count users
            const userCount = companyUsers.length;

            // Calculate activity (based on number of sessions)
            let activity = 0;
            companyUsers.forEach(user => {
                activity += parseInt(user.web_session) || 0;
            });

            // Count as active if it has any user activity
            if (activity > 0) {
                analysis.activeCompanies++;
            }

            // Check if most active
            if (activity > analysis.mostActiveCompany.activity) {
                analysis.mostActiveCompany = {
                    name: companyName,
                    activity: activity
                };
            }

            // Add to companies by user count
            analysis.companiesByUserCount.push({
                id: companyId,
                name: companyName,
                userCount: userCount
            });
        });

        // Calculate average users per company
        const totalUsersInCompanies = Object.values(usersByCompany).reduce((sum, users) => sum + users.length, 0);
        analysis.avgUsersPerCompany = companies.length > 0 ? totalUsersInCompanies / companies.length : 0;

        return analysis;
    }
    function analyzeCrossData(allDataBySurvey) {
        const analysis = {
            responsesByDevice: {},
            responsesByBrowser: {},
            responsesByCompanySize: {}
        };

        // Map companies to their user counts (as a measure of size)
        const companySizes = {};
        const companyUsers = {};

        // First pass to count users per company
        allDataBySurvey.forEach(item => {
            const companyId = item.company_id;
            if (companyId) {
                if (!companyUsers[companyId]) {
                    companyUsers[companyId] = new Set();
                }
                companyUsers[companyId].add(item.user_id);
            }
        });

        // Calculate company sizes
        for (const companyId in companyUsers) {
            companySizes[companyId] = companyUsers[companyId].size;
        }

        // Analyze response patterns
        allDataBySurvey.forEach(item => {
            // Count by device type
            const deviceType = item.device_type || 'Unknown';
            if (!analysis.responsesByDevice[deviceType]) {
                analysis.responsesByDevice[deviceType] = 0;
            }
            analysis.responsesByDevice[deviceType]++;

            // Count by browser
            const browser = item.browser_name || 'Unknown';
            if (!analysis.responsesByBrowser[browser]) {
                analysis.responsesByBrowser[browser] = 0;
            }
            analysis.responsesByBrowser[browser]++;

            // Count by company size (bucketed)
            const companyId = item.company_id;
            if (companyId && companySizes[companyId]) {
                const userCount = companySizes[companyId];
                // Create size buckets
                let sizeBucket;
                if (userCount < 5) sizeBucket = '1-4';
                else if (userCount < 10) sizeBucket = '5-9';
                else if (userCount < 50) sizeBucket = '10-49';
                else if (userCount < 100) sizeBucket = '50-99';
                else sizeBucket = '100+';

                if (!analysis.responsesByCompanySize[sizeBucket]) {
                    analysis.responsesByCompanySize[sizeBucket] = 0;
                }
                analysis.responsesByCompanySize[sizeBucket]++;
            }
        });

        return analysis;
    }
    function generateInsights(data) {
        const insights = [];

        // If we have user data
        if (data.data && data.data.users && data.data.users.length > 0) {
            const userAnalytics = analyzeUserData(data.data.users);

            // Most common device type
            const topDeviceType = Object.entries(userAnalytics.deviceTypes)
                .sort((a, b) => b[1] - a[1])[0];
            if (topDeviceType) {
                insights.push(`${topDeviceType[0]} is the most common device type (${topDeviceType[1]} users, ${Math.round(topDeviceType[1] * 100 / userAnalytics.totalUsers)}% of total).`);
            }

            // Most common browser
            const topBrowser = Object.entries(userAnalytics.browsers)
                .sort((a, b) => b[1] - a[1])[0];
            if (topBrowser) {
                insights.push(`${topBrowser[0]} is the most used browser (${topBrowser[1]} users, ${Math.round(topBrowser[1] * 100 / userAnalytics.totalUsers)}% of total).`);
            }

            // Web sessions
            if (userAnalytics.avgWebSessions > 0) {
                insights.push(`Users have an average of ${userAnalytics.avgWebSessions.toFixed(1)} web sessions.`);
            }
        }

        // If we have survey data
        if (data.data && data.data.surveys && data.data.surveys.length > 0) {
            const surveyAnalytics = analyzeSurveyData(data.data.surveys, data.data.questionMapping || {});

            // Most responded survey
            const topSurvey = Object.entries(surveyAnalytics.surveyResponses)
                .sort((a, b) => b[1] - a[1])[0];
            if (topSurvey) {
                const surveyName = surveyAnalytics.surveyNames[topSurvey[0]] || `Survey ${topSurvey[0]}`;
                insights.push(`"${surveyName}" has the highest response rate with ${topSurvey[1]} responses.`);
            }

            // If we have question choice data
            if (Object.keys(surveyAnalytics.questionChoices).length > 0) {
                // Find the question with the most consistent answer
                let mostConsistentQuestionId = null;
                let mostConsistentPercentage = 0;

                for (const questionId in surveyAnalytics.questionChoices) {
                    const choices = surveyAnalytics.questionChoices[questionId];
                    const totalResponses = Object.values(choices).reduce((sum, count) => sum + count, 0);
                    const topChoice = Object.entries(choices).sort((a, b) => b[1] - a[1])[0];
                    const percentage = topChoice[1] / totalResponses;

                    if (percentage > mostConsistentPercentage) {
                        mostConsistentPercentage = percentage;
                        mostConsistentQuestionId = questionId;
                    }
                }

                if (mostConsistentQuestionId && mostConsistentPercentage > 0.5) {
                    const questionText = surveyAnalytics.questionTexts[mostConsistentQuestionId] || `Question ${mostConsistentQuestionId}`;
                    const choices = surveyAnalytics.questionChoices[mostConsistentQuestionId];
                    const topChoice = Object.entries(choices).sort((a, b) => b[1] - a[1])[0];

                    insights.push(`"${questionText}" has a consistent response with ${Math.round(mostConsistentPercentage * 100)}% choosing "${topChoice[0]}".`);
                }
            }
        }

        // If we have company data
        if (data.data && data.data.companies && data.data.companies.length > 0) {
            const companyAnalytics = analyzeCompanyData(data.data.companies, data.data.users || []);

            if (companyAnalytics.mostActiveCompany.name !== 'Unknown') {
                insights.push(`"${companyAnalytics.mostActiveCompany.name}" is the most active company based on user engagement.`);
            }

            if (companyAnalytics.avgUsersPerCompany > 0) {
                insights.push(`Companies have an average of ${companyAnalytics.avgUsersPerCompany.toFixed(1)} users.`);
            }
        }

        // If we have cross-analysis data
        if (data.data && data.data.allDataBySurvey && data.data.allDataBySurvey.length > 0) {
            const crossAnalytics = analyzeCrossData(data.data.allDataBySurvey);

            // Device type response patterns
            const deviceTypes = Object.entries(crossAnalytics.responsesByDevice)
                .sort((a, b) => b[1] - a[1]);

            if (deviceTypes.length >= 2) {
                const topDevice = deviceTypes[0];
                const secondDevice = deviceTypes[1];

                if (topDevice[1] > secondDevice[1] * 1.5) {
                    insights.push(`${topDevice[0]} users are significantly more likely to respond to surveys than ${secondDevice[0]} users (${topDevice[1]} vs ${secondDevice[1]} responses).`);
                }
            }
        }

        // If we don't have enough insights, add some generic ones
        if (insights.length < 3) {
            if (data.data && data.data.users) {
                insights.push(`User engagement data suggests opportunities for targeted onboarding improvements.`);
            }

            if (data.data && data.data.surveys) {
                insights.push(`Examining survey response patterns can help identify user satisfaction drivers.`);
            }
        }

        return insights;
    }
    function generateRecommendations(data) {
        const recommendations = [];

        // If we have user data
        if (data.data && data.data.users && data.data.users.length > 0) {
            const userAnalytics = analyzeUserData(data.data.users);

            // Device type recommendations
            if (userAnalytics.deviceTypes['mobile'] && userAnalytics.deviceTypes['computer']) {
                const mobileCount = userAnalytics.deviceTypes['mobile'] || 0;
                const computerCount = userAnalytics.deviceTypes['computer'] || 0;

                if (mobileCount > computerCount * 0.4) {
                    recommendations.push(`Optimize mobile experience as ${Math.round(mobileCount * 100 / userAnalytics.totalUsers)}% of users access from mobile devices.`);
                }
            }

            // Browser recommendations
            const browserCounts = Object.entries(userAnalytics.browsers)
                .sort((a, b) => b[1] - a[1]);

            if (browserCounts.length > 1) {
                recommendations.push(`Ensure full compatibility with ${browserCounts.slice(0, 2).map(b => b[0]).join(' and ')}, which account for the majority of your users.`);
            }
        }

        // If we have survey data
        if (data.data && data.data.surveys && data.data.surveys.length > 0) {
            recommendations.push(`Consider creating focused follow-up surveys based on responses to better understand user needs.`);

            // Completion rate recommendation
            if (data.data.users && data.data.users.length > 0) {
                const surveyCompleteRate = data.data.surveys.length / data.data.users.length;
                if (surveyCompleteRate < 0.5) {
                    recommendations.push(`Improve survey completion rates by offering incentives or streamlining the survey design.`);
                }
            }
        }

        // If we have cross-analysis data
        if (data.data && data.data.allDataBySurvey && data.data.allDataBySurvey.length > 0) {
            const crossAnalytics = analyzeCrossData(data.data.allDataBySurvey);

            // Company size recommendations
            if (crossAnalytics.responsesByCompanySize) {
                const smallCompanyResponses = (crossAnalytics.responsesByCompanySize['1-4'] || 0) +
                    (crossAnalytics.responsesByCompanySize['5-9'] || 0);

                const largeCompanyResponses = (crossAnalytics.responsesByCompanySize['50-99'] || 0) +
                    (crossAnalytics.responsesByCompanySize['100+'] || 0);

                if (smallCompanyResponses > largeCompanyResponses) {
                    recommendations.push(`Focus on supporting smaller organizations with tailored onboarding and educational content.`);
                } else if (largeCompanyResponses > smallCompanyResponses) {
                    recommendations.push(`Develop enterprise features and team collaboration tools that benefit larger organizations.`);
                }
            }
        }

        // Add general recommendations if needed
        if (recommendations.length < 3) {
            recommendations.push(`Regularly analyze key metrics to track progress and identify trends in user behavior.`);
            recommendations.push(`Consider A/B testing of content and features to optimize user engagement.`);
            recommendations.push(`Establish a feedback loop with key users to gather qualitative insights beyond survey data.`);
        }

        return recommendations;
    }

})();