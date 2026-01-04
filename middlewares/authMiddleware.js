import jwt from "jsonwebtoken";

export const protect = (req,res,next)=>{

    try{

        const token = req.cookies.token_ax || req.headers.authorization?.split(" ")[1];

        if (!token) {
            return res.status(401).json({ success: false, message: "Not logged in" });
        }
        
        const decoded = jwt.verify(token, process.env.JWT_KEY);
        req.user = decoded; // store user info in request
        next();
        
    } catch (err) {
        return res.status(401).json({ success: false, message: "Invalid token" });
    }

}