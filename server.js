const express=require("express");
const cors=require("cors");
const multer=require("multer");
const path=require("path");
const fs=require("fs");
const crypto=require("crypto");

const app=express();
const PORT=process.env.PORT||3000;
const RATE=Number(process.env.VIEW_RATE||0.50);
const uploadDir=path.join(__dirname,"uploads");
if(!fs.existsSync(uploadDir))fs.mkdirSync(uploadDir,{recursive:true});

app.use(cors());
app.use(express.json());
app.use("/uploads",express.static(uploadDir));

const dbFile=path.join(__dirname,"data.json");
let db=fs.existsSync(dbFile)?JSON.parse(fs.readFileSync(dbFile)): {videos:[]};
function save(){fs.writeFileSync(dbFile,JSON.stringify(db,null,2));}

const storage=multer.diskStorage({
 destination:(req,file,cb)=>cb(null,uploadDir),
 filename:(req,file,cb)=>{
  const ext=path.extname(file.originalname).toLowerCase();
  cb(null,crypto.randomUUID()+ext);
 }
});
const upload=multer({
 storage,
 limits:{fileSize:250*1024*1024},
 fileFilter:(req,file,cb)=>file.mimetype.startsWith("video/")?cb(null,true):cb(new Error("Only video files are allowed"))
});

app.get("/api/health",(req,res)=>res.json({status:"ok",service:"PerebAI TV"}));

app.get("/api/videos",(req,res)=>{
 res.json(db.videos.slice().reverse());
});

app.post("/api/videos/upload",upload.single("video"),(req,res)=>{
 if(!req.file)return res.status(400).json({error:"Video file is required"});
 const video={
  id:crypto.randomUUID(),
  title:req.body.title?.trim(),
  description:req.body.description?.trim()||"",
  creator:req.body.creator?.trim(),
  videoUrl:"/uploads/"+req.file.filename,
  views:0,
  earnings:0,
  createdAt:new Date().toISOString()
 };
 if(!video.title||!video.creator)return res.status(400).json({error:"Title and creator are required"});
 db.videos.push(video);save();res.status(201).json(video);
});

app.post("/api/videos/:id/view",(req,res)=>{
 const v=db.videos.find(x=>x.id===req.params.id);
 if(!v)return res.status(404).json({error:"Video not found"});
 v.views++;v.earnings=Number((v.views*RATE).toFixed(2));save();
 res.json({views:v.views,earnings:v.earnings});
});

app.get("/api/dashboard",(req,res)=>{
 const totalViews=db.videos.reduce((n,v)=>n+v.views,0);
 const totalVideos=db.videos.length;
 res.json({totalViews,totalVideos,earnings:Number((totalViews*RATE).toFixed(2)),rate:RATE});
});

app.use((err,req,res,next)=>res.status(400).json({error:err.message||"Request failed"}));

app.listen(PORT,()=>console.log(`PerebAI TV API running on port ${PORT}`));