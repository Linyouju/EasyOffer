import fs from 'node:fs/promises';
for(const name of ['button','badge','table','dropdown-menu','tabs','input','dialog','card']){
 const url=`https://ui.shadcn.com/r/styles/new-york/${name}.json`;
 const response=await fetch(url);if(!response.ok)throw Error(name+': '+response.status);
 const data=await response.json();
 for(const file of data.files)await fs.writeFile('components/'+file.path,file.content);
 console.log('Installed official shadcn/ui '+name);
}
