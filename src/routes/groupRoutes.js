const express = require('express');
const router = express.Router();
const { 
    getTotalOfGroup,
    createGroup,
    getGroupMembersWithTotal,
    createGroupExpense,
    UpdateGroupExpense,
    deleteGroupExpense,
    getGroupTransactions,
    exitFromGroup
} = require('../controllers/groupController'); // Import the controller method

// Define the route to get username

router.post(`/getgrouptotal`,getTotalOfGroup);

router.post(`/creategroup`,createGroup);

router.post(`/getmembersandtotal`,getGroupMembersWithTotal);

router.post(`/creategroupexpense`,createGroupExpense);

router.put(`/updategroupexpense`,UpdateGroupExpense);

router.delete(`/deletegroupexpense`,deleteGroupExpense);

router.post(`/getgrouphistory`,getGroupTransactions);

router.post(`/exitgroup`,exitFromGroup)

module.exports = router;
