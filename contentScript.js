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
    async function exportAnalytics(options) {
        try {
            // Get JWT token from localStorage
            const jwt = localStorage.getItem('__ugJWT');
            if (!jwt) {
                throw new Error('JWT token not found. Please make sure you are logged into UserGuiding.');
            }

            // Report initial progress
            // updateProgress(10, "Preparing to fetch data...");

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
            if (options.includeSurveys || options.mergeUserSurvey) {
                // updateProgress(15, "Fetching survey question metadata...");
                questionMapping = await fetchSurveyQuestions(jwt);

                // Add to master data
                masterData.data.questionMapping = questionMapping;
            }

            // Fetch and export data based on options
            if (options.includeUsers) {
                // updateProgress(20, "Fetching users data...");
                userData = await fetchUsers(jwt, options.limitRows);

                // Process data if anonymization is requested
                if (options.anonymizeData) {
                    userData = anonymizeUserData(userData);
                }

                // Add to master data
                masterData.data.users = userData;

                // Export Users CSV
                // updateProgress(25, "Exporting users data...");
                exportCSV(userData, `UserGuiding_Users_${date}.csv`);
                filesExported++;
                // updateProgress(30, "Users data exported...");
            }

            if (options.includeSurveys) {
                // updateProgress(35, "Fetching survey responses...");
                surveyData = await fetchSurveys(jwt, options.limitRows);

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
                // updateProgress(40, "Exporting survey data...");
                exportCSV(surveyData, `UserGuiding_Surveys_${date}.csv`);
                filesExported++;
                // updateProgress(45, "Survey data exported...");

                // Export a separate questions reference file for easier analysis
                if (questionMapping && Object.keys(questionMapping).length > 0) {
                    exportQuestionsReference(questionMapping, `UserGuiding_Questions_Reference_${date}.csv`);
                    filesExported++;
                }
            }

            if (options.includeCompanies) {
                // updateProgress(50, "Fetching company data...");
                companyData = await fetchCompanies(jwt, options.limitRows);

                // Process data if anonymization is requested
                if (options.anonymizeData) {
                    companyData = anonymizeCompanyData(companyData);
                }

                // Add to master data
                masterData.data.companies = companyData;

                // Export Companies CSV
                // updateProgress(55, "Exporting company data...");
                exportCSV(companyData, `UserGuiding_Companies_${date}.csv`);
                filesExported++;
                // updateProgress(60, "Company data exported...");
            }

            // Create and export merged data
            if (options.mergeUserSurvey) {
                // updateProgress(65, "Creating user-survey merged data...");

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

                // Add to master data
                masterData.data.userSurveyMerged = mergedData;

                // Export merged data
                // updateProgress(75, "Exporting user-survey merged data...");
                exportCSV(mergedData, `UserGuiding_Users-Survey_${date}.csv`);
                filesExported++;
            }

            if (options.mergeUserCompany) {
                // updateProgress(80, "Creating user-company merged data...");

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
                // updateProgress(85, "Exporting user-company merged data...");
                exportCSV(mergedData, `UserGuiding_Users-Company_${date}.csv`);
                filesExported++;
            }

            // Export the combined JSON data - optimize it first
            // updateProgress(88, "Creating combined JSON export...");
            const optimizedData = optimizeJsonForExport(masterData);
            exportJSON(optimizedData, `UserGuiding_Complete_Export_${date}.json`);
            filesExported++;

            // Export a README file with analysis instructions
            if (options.includeGuide) {
                // updateProgress(90, "Creating analysis instructions...");
                exportAnalysisInstructions(date, !!questionMapping);
                filesExported++;
            }

            // Create data preview if requested
            if (options.includePreview && (userData || surveyData || companyData)) {
                // updateProgress(95, "Generating data preview...");
                showDataPreview(userData, surveyData, companyData, questionMapping);
            }

            // updateProgress(100, "Export complete!");

            // Return success
            return {
                status: "success",
                message: `Successfully exported ${filesExported} files.`
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
    async function fetchUsers(jwt, limitRows = false) {
        const body = {
            page: 0,
            page_size: 100,
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

        const response = await fetch("https://uapi.userguiding.com/panel/users", {
            method: "POST",
            headers: {
                "accept": "application/json",
                "content-type": "application/json",
                "ug-api-token": jwt
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch users: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Process users to flatten complex objects
        const processedUsers = [];

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

        return processedUsers;
    }

    // Helper function to fetch Survey data
    async function fetchSurveys(jwt, limitRows = false) {
        const response = await fetch("https://uapi.userguiding.com/panel/survey-responses", {
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

        if (!response.ok) {
            throw new Error(`Failed to fetch survey responses: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const processedResponses = [];

        // Process responses to flatten the data
        if (data.responses && Array.isArray(data.responses)) {
            data.responses.forEach(response => {
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

        // Limit if needed
        if (limitRows && processedResponses.length > 1000) {
            return processedResponses.slice(0, 1000);
        }

        return processedResponses;
    }

    // Helper function to fetch Companies data
    async function fetchCompanies(jwt, limitRows = false) {
        const response = await fetch("https://uapi.userguiding.com/panel/companies", {
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
        })

        if (!response.ok) {
            throw new Error(`Failed to fetch companies: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const processedCompanies = [];

        // Process companies to flatten complex objects
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

        // Limit if needed
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
        if (!data || !data.length) return;

        // Get headers from first object
        const headers = Object.keys(data[0]);

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

}
)();