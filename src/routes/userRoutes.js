const express = require('express');
const router = express.Router();
const { 
    getUser,
    getGroups,
    updateUser,
    getUserPersonalExpense,
    getUserGroupTotalExpense,
    getUserExpenseCategoryWise,
    getUserExpenseHistory,
    addPersonalExpense,
    deletePersonalExpense,
    updatePersonalExpense,
    personalBarChart,
    groupWiseActiveExpenses,
    downloadTransactionsCSV,
    downloadTransactionsPDF
    
 } = require('../controllers/userController'); // Import the controller method
const { route } = require('./groupRoutes');

// Define the route to get username
router.get('/getuser', getUser);

router.get('/getgroups',getGroups);

router.patch('/updateuser',updateUser);

router.get('/totalexpenseofuser',getUserPersonalExpense);

router.get('/usergroupexpensetotal',getUserGroupTotalExpense);

router.get('/userexpensecategorywise',getUserExpenseCategoryWise);

router.get('/getuserpersonalhistory',getUserExpenseHistory);

router.post('/addpersonalexpense',addPersonalExpense);

router.delete('/deletepersonalexpense',deletePersonalExpense);

router.put('/updatepersonalexpense',updatePersonalExpense);

router.post('/getpersonalbarchart', personalBarChart);

router.get(`/getgrouphistoryofauser`,groupWiseActiveExpenses)

router.get(`/downloadcsvreport`,downloadTransactionsCSV);

router.get(`/downloadpdfreport`,downloadTransactionsPDF);

module.exports = router;
