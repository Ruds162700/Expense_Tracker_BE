const jwt = require('jsonwebtoken');

const authMiddleware = (req,res,next)=>{
    try{
     const token = req.headers.authorization?.split(" ")[1];
     if(!token){
        return res.status(401).json({
            status:false,
            message:"No Token Provided. Please Login"
        });
     }
    jwt.verify(token,process.env.JWT_SECRET,(err,decoded)=>{
        if(err){
            return res.status(401).json({
                status:false,
                message:"Invalid or Expired Token."
            });
        }
        // console.log(decoded);
        req.user = decoded.user_id;
        next();
    }) 

    }catch(error){
        return res.status(500).json({
            status:false,
            message:"Internal Server Error."
        });
    }
    

}
module.exports = authMiddleware;