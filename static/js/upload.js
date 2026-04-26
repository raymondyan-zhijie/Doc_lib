/* ============================================================
   upload.js — File upload (drag/drop, select, XHR progress)
   ============================================================ */

let uploadFiles=[];

function showUploadDialog(){
  uploadFiles=[];
  refreshUploadQueue();
  document.getElementById('uploadFileInput').value='';
  document.getElementById('uploadProgress').style.display='none';
  document.getElementById('uploadDialog').classList.add('visible');
}

function closeUploadDialog(){
  document.getElementById('uploadDialog').classList.remove('visible');
}

function handleFileSelect(e){
  if(e.target.files.length>0) addUploadFiles(e.target.files);
}

function handleFileDrop(e){
  e.preventDefault();
  document.getElementById('uploadDropZone').style.borderColor='var(--border)';
  if(e.dataTransfer.files.length>0) addUploadFiles(e.dataTransfer.files);
}

function addUploadFiles(fileList){
  let added=0, skippedNonZip=0, skippedSize=0, skippedDup=0;
  for(let i=0;i<fileList.length;i++){
    const file=fileList[i];
    if(!file.name.toLowerCase().endsWith('.zip')){ skippedNonZip++; continue; }
    if(file.size>MAX_UPLOAD_PER_FILE){ skippedSize++; continue; }
    if(uploadFiles.some(function(f){return f.name===file.name;})){ skippedDup++; continue; }
    uploadFiles.push(file);
    added++;
  }
  const msgs=[];
  if(added>0) msgs.push('已添加 '+added+' 个文件');
  if(skippedNonZip>0) msgs.push(skippedNonZip+' 个非 ZIP 文件已跳过');
  if(skippedSize>0) msgs.push(skippedSize+' 个超过 8 GB 已跳过');
  if(skippedDup>0) msgs.push(skippedDup+' 个重复文件已跳过');
  if(msgs.length>0) showToast(msgs.join('，'));
  refreshUploadQueue();
}

function removeUploadFile(index){
  uploadFiles.splice(index,1);
  refreshUploadQueue();
}

function refreshUploadQueue(){
  const listEl=document.getElementById('uploadFileList');
  const btn=document.getElementById('uploadStartBtn');
  const dropText=document.getElementById('uploadFileName');
  if(uploadFiles.length===0){
    listEl.style.display='none';
    listEl.innerHTML='';
    btn.disabled=true;
    dropText.innerHTML='拖拽一个或多个 ZIP 文件到此处或点击选择';
  } else {
    let totalSize=0;
    let html='';
    for(let i=0;i<uploadFiles.length;i++){
      totalSize+=uploadFiles[i].size;
      html+='<div style="font-size:12px;padding:5px 8px;margin:2px 0;background:var(--badge-bg);border-radius:4px;display:flex;justify-content:space-between;align-items:center">'+
        '<span><b>'+esc(uploadFiles[i].name)+'</b> <span style="color:var(--text2)">'+fmtSize(uploadFiles[i].size)+'</span></span>'+
        '<a style="color:var(--accent);cursor:pointer;font-weight:bold;font-size:15px" onclick="removeUploadFile('+i+')">&times;</a>'+
        '</div>';
    }
    listEl.innerHTML=html;
    listEl.style.display='block';
    btn.disabled=false;
    dropText.innerHTML='<b>'+uploadFiles.length+'</b> 个文件 &middot; 共 '+fmtSize(totalSize);
  }
}

async function startUpload(){
  if(uploadFiles.length===0) return;
  const btn=document.getElementById('uploadStartBtn');
  btn.disabled=true;
  const progressEl=document.getElementById('uploadProgress');
  const fillEl=document.getElementById('uploadProgressFill');
  const textEl=document.getElementById('uploadProgressText');
  progressEl.style.display='block';
  fillEl.style.width='0%';
  textEl.textContent='准备上传 '+uploadFiles.length+' 个文件...';

  const formData=new FormData();
  for(let i=0;i<uploadFiles.length;i++){
    formData.append('files', uploadFiles[i]);
  }

  const xhr=new XMLHttpRequest();
  xhr.open('POST', '/api/upload');
  xhr.setRequestHeader('X-DocLib-Token', token);

  xhr.upload.onprogress=function(e){
    if(e.lengthComputable){
      const pct=Math.round(e.loaded/e.total*100);
      fillEl.style.width=pct+'%';
      textEl.textContent='上传中 '+fmtSize(e.loaded)+' / '+fmtSize(e.total)+' ('+pct+'%)';
    }
  };

  xhr.onload=function(){
    try{
      const d=JSON.parse(xhr.responseText);
      let okCount=0, errCount=0, totalNew=0;
      if(d.results){
        d.results.forEach(function(r){
          if(r.status==='ok'){ okCount++; totalNew+=r.new_entries||0; }
          else errCount++;
        });
      }
      fillEl.style.width='100%';
      let msg;
      if(errCount===0){
        msg='全部成功: 共添加 '+totalNew+' 个条目 ('+okCount+' 个归档文件)';
      } else if(okCount>0){
        msg='部分成功: '+okCount+' 个完成, '+errCount+' 个失败';
        d.results.forEach(function(r){
          if(r.status==='error') showToast(r.error||'上传失败', true);
        });
      } else {
        msg='全部失败';
        if(d.results && d.results[0]) showToast(d.results[0].error||'上传失败', true);
      }
      textEl.textContent=msg;
      showToast(msg, errCount>0);
      setTimeout(function(){ init(); closeUploadDialog(); }, 2000);
    } catch(ex){
      showToast('解析响应失败', true);
      progressEl.style.display='none';
      btn.disabled=false;
    }
  };

  xhr.onerror=function(){
    showToast('上传失败: 网络错误', true);
    progressEl.style.display='none';
    btn.disabled=false;
  };

  xhr.send(formData);
}
