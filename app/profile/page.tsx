"use client";

import { useState, useRef } from "react";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { 
  Briefcase, 
  CircleHelp, 
  Copy,
  FileText, 
  Shield, 
  ChevronRight,
  Camera,
  Plus
} from "lucide-react";

export default function ProfilePage() {
  const [copied, setCopied] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("/assets/avatar.png");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const copyAddress = () => {
    navigator.clipboard.writeText("0x71C...976F");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAvatarUrl(url);
    }
  };

  return (
    <SidebarLayout>
      <div className="max-w-[1000px] w-full px-6 py-6 md:px-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16">
          
          {/* Left Column */}
          <div className="flex flex-col space-y-6">
            
            {/* Profile Card */}
            <div className="flex flex-col items-center justify-center rounded-[32px] bg-[#EEF1EB] dark:bg-[#181818] p-10 text-center relative overflow-hidden">
              <div className="relative mb-6">
                <div className="h-[100px] w-[100px] overflow-hidden rounded-full border-4 border-[#EEF1EB] dark:border-[#181818] bg-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={avatarUrl} alt="Damini Ogulu" className="h-full w-full object-cover" />
                </div>
                <input 
                  type="file" 
                  accept="image/*" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  className="hidden" 
                />
                <button 
                  onClick={handleAvatarClick}
                  className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#EEF1EB] dark:border-[#181818] bg-brand text-white hover:bg-brand-2 transition-colors"
                >
                  <Camera className="h-4 w-4" />
                </button>
              </div>
              
              <h1 className="text-[32px] font-black uppercase tracking-tight text-[#133015] dark:text-white leading-none">
                DAMINI OGULU
              </h1>
              <p className="mt-5 text-[14px] font-semibold text-[#4F5B51] dark:text-slate-400">
                Your wallet
              </p>
              
              <button 
                onClick={copyAddress}
                className="mt-2 flex items-center gap-2 rounded-full bg-[#E2E6DF] dark:bg-slate-800 px-4 py-1.5 text-[14px] font-medium text-[#133015] dark:text-white hover:bg-[#D4D9D0] dark:hover:bg-slate-700 transition-colors group"
              >
                <span>{copied ? "Copied!" : "0x71C...976F"}</span>
                {!copied && <Copy className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity" />}
              </button>
            </div>



            {/* Meta Actions */}
            <div className="mt-4 flex flex-col items-center gap-4">

              
              <button className="rounded-full bg-brand/10 px-6 py-2 text-[13px] font-bold text-brand hover:bg-brand/20 active:bg-brand-2 active:text-white transition-colors">
                Log out
              </button>
            </div>
            
          </div>
          
          {/* Right Column */}
          <div className="flex flex-col space-y-10">
            
            {/* Your Account */}
            <div>
              <h2 className="mb-4 text-[26px] font-bold tracking-tight text-[#133015] dark:text-white">
                Your account
              </h2>
              <div className="flex flex-col">
                <ProfileListItem icon={CircleHelp} title="Help" />
                <ProfileListItem icon={FileText} title="Statements and reports" />
              </div>
            </div>

            {/* Settings */}
            <div>
              <h2 className="mb-4 text-[22px] font-bold tracking-tight text-[#133015] dark:text-white">
                Settings
              </h2>
              <div className="flex flex-col">
                <ProfileListItem 
                  icon={Shield} 
                  title="Security and privacy" 
                  description="Change your security and privacy settings." 
                />
                <ProfileListItem 
                  icon={BellRing} 
                  title="Notifications" 
                  description="Customise how you get updates." 
                />
              </div>
            </div>

          </div>

        </div>
      </div>
    </SidebarLayout>
  );
}

// Subcomponents

function ProfileListItem({ icon: Icon, title, description }: { icon: any, title: string, description?: string }) {
  return (
    <button className="group flex w-full items-center justify-between border-b border-[#F5F5F5] dark:border-slate-800/60 py-4 transition-colors hover:bg-[#F8F9F7] dark:hover:bg-slate-800/30 px-2 -mx-2 rounded-xl">
      <div className="flex items-center gap-5">
        <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full border border-[#EFEFEF] dark:border-slate-700 bg-transparent text-[#133015] dark:text-white">
          <Icon className="h-[22px] w-[22px] stroke-[1.5]" />
        </div>
        <div className="text-left">
          <p className="text-[15px] font-bold text-[#133015] dark:text-white">{title}</p>
          {description && (
            <p className="text-[13px] text-[#4F5B51] dark:text-slate-400 mt-0.5">{description}</p>
          )}
        </div>
      </div>
      <ChevronRight className="h-5 w-5 text-[#4F5B51] dark:text-slate-400 opacity-50 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

// I need to import BellRing which wasn't imported. Let me add it.
function BellRing(props: any) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      <path d="M4 2C2.8 3.7 2 5.7 2 8" />
      <path d="M22 8c0-2.3-.8-4.3-2-6" />
    </svg>
  );
}
