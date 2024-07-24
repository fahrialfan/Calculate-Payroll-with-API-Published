import http from 'k6/http';
import { check } from 'k6';
import { setup as loginSetup } from './login.js'; // Import setup function from login.js with an alias

const baseUrl = 'https://example.com';

export function setup() {
    return loginSetup(); // Call the setup function from login.js to get the accessToken
}

export default function (data) {
    if (!data || !data.accessToken) {
        console.error('No access token, skipping default function execution');
        return;
    }

    const accessToken = data.accessToken;

    // Parameters in API, fill according to your API
    const employeeId = '123456-hjkasd-sss001-aa12-bb123';
    const departmentId = '123456-hjkasd-sss001-aa12-bb123';
    const year = 2024;
    const month = 7;
    const rateCurrency = 16131.46594067;
    const totalDaysInMonth = 30;
    const age = 29;
	const page= 1;

    // Construct the URL with the provided parameters
    const payslipUrl = `${baseUrl}/payroll/${departmentId}/employee/payslip?year=${year}&month=${month}&page=${page}`;
    const contractUrl = `${baseUrl}/contract/${employeeId}`;

    // Make the API call to get payslip pagination
    const payslipResponse = http.get(payslipUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    check(payslipResponse, {
        'status is 200': (r) => r.status === 200,
        'response is not empty': (r) => r.body.length > 0,
    });

    // Make the API call to get contract details
    const contractResponse = http.get(contractUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    check(contractResponse, {
        'status is 200': (r) => r.status === 200,
        'response is not empty': (r) => r.body.length > 0,
    });

    // Parse the responses
    const payslipData = JSON.parse(payslipResponse.body);
    const contractData = JSON.parse(contractResponse.body);

    // Extract necessary fields from contractData
    const {
        basicSalary = 0,
        fixedOvertimeAllowance = 0,
        leaveSalary = 0,
        administrationAndUniformAllowance = 0,
        tradeAllowance = 0,
        others = 0,
        contractCompletionBonus = 0
    } = contractData || {};

    let matchingPayslipItem = null;
	
    // Iterate through the payslipData.items to find the matching item by employeeId
    for (const item of payslipData.items) {
        if (item.employeeId === employeeId) {
            matchingPayslipItem = item;
            break;
        }
    }

    if (matchingPayslipItem) {
        const {
            totalDaysOnboard = 0,
            totalDaysStandby = 0,
            paidOnBoard,
            adjustment = 0,
            standByAllowance,
            rankLabel
        } = matchingPayslipItem || {};

        // Calculate the expected values
        const onBoardSalary = basicSalary + fixedOvertimeAllowance + leaveSalary + administrationAndUniformAllowance + tradeAllowance + others;
        const salaryThisMonth = (onBoardSalary * totalDaysOnboard) / totalDaysInMonth;
        const standByAllowanceThisMonth = ((standByAllowance || 0) * totalDaysStandby) / totalDaysInMonth;

        let bpjsDepartmentOldAgeInsurance = 0;
        let bpjsDepartmentPensionInsurance = 0;
        let bpjsDepartmentDeathInsurance = 0;
        let bpjsDepartmentWorkAccidentInsurance = 0;
        let bpjsEmployeeOldAgeInsurance = 0;
        let bpjsEmployeePensionInsurance = 0;

        if (totalDaysOnboard === totalDaysInMonth) {
            if (rankLabel === 'Cadet') {
                bpjsDepartmentOldAgeInsurance = (basicSalary * (totalDaysOnboard / totalDaysInMonth)) * (0.02 + 0.037);
                bpjsDepartmentPensionInsurance = (0.02 + 0.037) * (totalDaysOnboard / totalDaysInMonth) * basicSalary;
                bpjsEmployeeOldAgeInsurance = 0;
                bpjsEmployeePensionInsurance = 0;
            } else {
                bpjsDepartmentOldAgeInsurance = (basicSalary * (totalDaysOnboard / totalDaysInMonth)) * 0.037;
                if (age < 58) {
                    if ((basicSalary * totalDaysOnboard / totalDaysInMonth) >= 9559600) {
                        bpjsDepartmentPensionInsurance = 0.02 * totalDaysOnboard / totalDaysInMonth * 9559600;
                        bpjsEmployeePensionInsurance = 0.01 * totalDaysOnboard / totalDaysInMonth * 9559600;
                    } else {
                        bpjsDepartmentPensionInsurance = 0.02 * totalDaysOnboard / totalDaysInMonth * basicSalary;
                        bpjsEmployeePensionInsurance = 0.01 * totalDaysOnboard / totalDaysInMonth * basicSalary;
                    }
                } else {
                    bpjsDepartmentPensionInsurance = 0;
                    bpjsEmployeePensionInsurance = 0;
                }
                bpjsEmployeeOldAgeInsurance = basicSalary * (totalDaysOnboard / totalDaysInMonth) * 0.02;
            }
            bpjsDepartmentDeathInsurance = basicSalary * (totalDaysOnboard / totalDaysInMonth) * 0.003;
            bpjsDepartmentWorkAccidentInsurance = basicSalary * (totalDaysOnboard / totalDaysInMonth) * 0.0174;
        }

        const paidThisMonthIDR = salaryThisMonth - ((paidOnBoard || 0) + bpjsEmployeeOldAgeInsurance + bpjsEmployeePensionInsurance) + adjustment + standByAllowanceThisMonth;
        const paidThisMonthUSD = paidThisMonthIDR / rateCurrency;
        const contractCompletionBonusHold = (contractCompletionBonus * totalDaysOnboard) / totalDaysInMonth;
        const totalActualSalaryIDR = salaryThisMonth + (adjustment || 0) + standByAllowanceThisMonth + contractCompletionBonusHold;
        const totalActualSalaryUSD = totalActualSalaryIDR / rateCurrency;
        const bpjsDepartmentTotalInsurance = bpjsDepartmentOldAgeInsurance + bpjsDepartmentPensionInsurance + bpjsDepartmentDeathInsurance + bpjsDepartmentWorkAccidentInsurance;
        const bpjsTotalInsurance = bpjsDepartmentTotalInsurance + bpjsEmployeeOldAgeInsurance + bpjsEmployeePensionInsurance;


        const roundToTwo = num => Math.round(num * 100) / 100;

        // Compare the calculated values with the actual values from payslipItem
        const results = {
            'onBoardSalary is correct': roundToTwo(matchingPayslipItem.onBoardSalary) === roundToTwo(onBoardSalary),
            'salaryThisMonth is correct': roundToTwo(matchingPayslipItem.salaryThisMonth) === roundToTwo(salaryThisMonth),
            'paidThisMonthIDR is correct': roundToTwo(matchingPayslipItem.paidThisMonthIDR) === roundToTwo(paidThisMonthIDR),
            'paidThisMonthUSD is correct': roundToTwo(matchingPayslipItem.paidThisMonthUSD) === roundToTwo(paidThisMonthUSD),
            'contractCompletionBonusHold is correct': roundToTwo(matchingPayslipItem.contractCompletionBonusHold) === roundToTwo(contractCompletionBonusHold),
            'totalActualSalaryIDR is correct': roundToTwo(matchingPayslipItem.totalActualSalaryIDR) === roundToTwo(totalActualSalaryIDR),
            'totalActualSalaryUSD is correct': roundToTwo(matchingPayslipItem.totalActualSalaryUSD) === roundToTwo(totalActualSalaryUSD),
            'bpjsDepartmentOldAgeInsurance is correct': roundToTwo(matchingPayslipItem.bpjsDepartmentOldAgeInsurance) === roundToTwo(bpjsDepartmentOldAgeInsurance),
            'bpjsDepartmentPensionInsurance is correct': roundToTwo(matchingPayslipItem.bpjsDepartmentPensionInsurance) === roundToTwo(bpjsDepartmentPensionInsurance),
            'bpjsDepartmentDeathInsurance is correct': roundToTwo(matchingPayslipItem.bpjsDepartmentDeathInsurance) === roundToTwo(bpjsDepartmentDeathInsurance),
            'bpjsDepartmentWorkAccidentInsurance is correct': roundToTwo(matchingPayslipItem.bpjsDepartmentWorkAccidentInsurance) === roundToTwo(bpjsDepartmentWorkAccidentInsurance),
            'bpjsEmployeeOldAgeInsurance is correct': roundToTwo(matchingPayslipItem.bpjsEmployeeOldAgeInsurance) === roundToTwo(bpjsEmployeeOldAgeInsurance),
            'bpjsEmployeePensionInsurance is correct': roundToTwo(matchingPayslipItem.bpjsEmployeePensionInsurance) === roundToTwo(bpjsEmployeePensionInsurance),
            'bpjsDepartmentTotalInsurance is correct': roundToTwo(matchingPayslipItem.bpjsDepartmentTotalInsurance) === roundToTwo(bpjsDepartmentTotalInsurance),
            'bpjsTotalInsurance is correct': roundToTwo(matchingPayslipItem.bpjsTotalInsurance) === roundToTwo(bpjsTotalInsurance),
        };
		
		// console log always show actual and expected 
		for (const [key, value] of Object.entries(results)) {
			const expectedKey = key.split(' ')[0];
			console.log(`${key}: ${value ? 'PASS' : 'FAIL'}`);
			console.log(`Expected: ${roundToTwo(eval(expectedKey))}, Actual: ${roundToTwo(matchingPayslipItem[expectedKey])}`);
		}
		
        check(results, {
            'onBoardSalary is correct': (r) => r['onBoardSalary is correct'],
            'salaryThisMonth is correct': (r) => r['salaryThisMonth is correct'],
            'paidThisMonthIDR is correct': (r) => r['paidThisMonthIDR is correct'],
            'paidThisMonthUSD is correct': (r) => r['paidThisMonthUSD is correct'],
            'contractCompletionBonusHold is correct': (r) => r['contractCompletionBonusHold is correct'],
            'totalActualSalaryIDR is correct': (r) => r['totalActualSalaryIDR is correct'],
            'totalActualSalaryUSD is correct': (r) => r['totalActualSalaryUSD is correct'],
            'bpjsDepartmentOldAgeInsurance is correct': (r) => r['bpjsDepartmentOldAgeInsurance is correct'],
            'bpjsDepartmentPensionInsurance is correct': (r) => r['bpjsDepartmentPensionInsurance is correct'],
            'bpjsDepartmentDeathInsurance is correct': (r) => r['bpjsDepartmentDeathInsurance is correct'],
            'bpjsDepartmentWorkAccidentInsurance is correct': (r) => r['bpjsDepartmentWorkAccidentInsurance is correct'],
            'bpjsEmployeeOldAgeInsurance is correct': (r) => r['bpjsEmployeeOldAgeInsurance is correct'],
            'bpjsEmployeePensionInsurance is correct': (r) => r['bpjsEmployeePensionInsurance is correct'],
            'bpjsDepartmentTotalInsurance is correct': (r) => r['bpjsDepartmentTotalInsurance is correct'],
            'bpjsTotalInsurance is correct': (r) => r['bpjsTotalInsurance is correct'],
        });
    }
}
