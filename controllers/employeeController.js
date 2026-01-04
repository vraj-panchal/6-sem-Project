import {eq} from "drizzle-orm";
import bcrypt from "bcrypt";
import {db} from "../config/db.js"
import { userTable } from "../src/db/schema/users.js";
import { rolesTable } from "../src/db/schema/roles.js";
import { user_status } from "../src/db/schema/user_status.js";
import { employeeRegistrationSchema , employeeLoginSchema } from "../validations/employeeValidator.js";
import { generateToken } from "../utils/generateTokens.js";
const JWT_KEY = process.env.JWT_KEY;


// dotenv.config();

export const registerEmployee = async (req, res) => {

  try {
    const result = employeeRegistrationSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        errors: result.error.fieldErrors,
      });
    }

    const image = req.file?.filename || null;
    const { username, email, phonenumber, password } = result.data;

    const role = await db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.role_name, "employee"))
      .limit(1);

    if (!role) {
      return res.status(400).json({ success: false, message: "Employee role not found" });
    }

    const status = await db
      .select()
      .from(user_status)
      .where(eq(user_status.status_name, "active"))
      .limit(1);

    let employee = await db.select().from(userTable).where(eq(userTable.email,email));

    if(employee.length > 0)
    {
        return res.status(409).json({success:false,message: " Email is alredy Exists "});
    }

        bcrypt.genSalt(10,function(err,salt){
            bcrypt.hash(password,salt, async function(err,hash){
                if(err){
                    return res.json({
                        success:false,
                        message:err.message
                    });
                }
                else{

                    let creatEmployee = await db.insert(userTable).values({
                        username:username,
                        email:email,
                        profile_image:profile_image,
                        password:hash,
                        name:name,
                        role:role.id,
                        status_id: status.id,
                    });

                    const getCreatedEmployeeRef = await db.select().from(userTable).where(eq(userTable.email,email));
                    const getCreatedEmployee= getCreatedEmployeeRef[0];
                    
                    const token = jwt.sign({id:getCreatedEmployee.id},JWT_KEY,{expiresIn:"10d"}); 
                    res.status(201).cookie("token",token);

                    return res.json({success:true,message:"Employee Registered ",data:{id:getCreatedEmployee.id,email:getCreatedEmployee.email,name:getCreatedEmployee.name,role:getCreatedEmployee.role}});
                }
            });
        });
  } 
  catch (err) {
    res.status(500).json({ success: false, message: `${err}` });
  }
};





export const loginEmployee = async function(req,res){

    try{

        const result = employeeLoginSchema.safeParse(req.body);

        if(!result.success)
        {
            return res.status(400).json({success:false,message:result.error.flatten().fieldErrors});
        }

        let {email,password} = result.data;

        let employee = await db.insert().select().from(userTable).where(eq(userTable.email,email));

        if(employee.length === 0)
        {
            res.status(500).json({success:false,message:"Email or Password Inccorect ."});
        }

        const employeePass = employee[0];

        bcrypt.compare(password,employeePass.password,function(err,result)
        {
            if(err)
            {
                res.status(500).json({success:false,message:`${err}`});
            }

            if(result)
            {
                let token = generateToken(employee);
                res.cookie("token",token);

                res.status(200).json({success:true,message:"Employee LoggedIn Successfully ",data:{name:employeePass.name,email:employeePass.email}});
            }
        })


    }

    catch(err)
    {
        res.status(500).json({success:false,message:`${err}`});
    }
};



export const logoutEmployee = async function(req,res){

    if(!req.cookies.token)
    {
        res.status(403).json({success:false,message:"Employee is not logged-In "});
    }

    res.cookie("token","");

    res.status(200).json({success:true,message:"Employee Logout"});

};

