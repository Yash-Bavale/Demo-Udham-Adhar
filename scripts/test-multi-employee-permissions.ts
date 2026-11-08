import {
  coreListFolders,
  coreCreateFolder,
  coreRenameFolder,
  coreDeleteFolder,
  coreToggleStar,
  coreMoveTickets,
  getTicketOrganizationMeta,
} from "@/lib/crm/support-folders.functions";

async function runMultiEmployeeTests() {
  console.log("=== MULTI-EMPLOYEE PERMISSION & ACCESS TEST SUITE ===");

  const employeeA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"; // Alice
  const employeeB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"; // Bob
  const ticket1 = "11111111-1111-1111-1111-111111111111";
  const ticket2 = "22222222-2222-2222-2222-222222222222";

  console.log("Testing with:");
  console.log("  Employee A (Alice):", employeeA);
  console.log("  Employee B (Bob):  ", employeeB);
  console.log("  Ticket 1:          ", ticket1);
  console.log("  Ticket 2:          ", ticket2);

  // ── TEST 1: Star Isolation (Stars are strictly private) ──
  console.log("\n--- TEST 1: Star Isolation ---");
  // Alice stars Ticket 1
  await coreToggleStar({ ticketId: ticket1, isStarred: true, userId: employeeA });
  // Bob stars Ticket 2
  await coreToggleStar({ ticketId: ticket2, isStarred: true, userId: employeeB });

  const aliceStars = await getTicketOrganizationMeta(employeeA, [ticket1, ticket2]);
  const bobStars = await getTicketOrganizationMeta(employeeB, [ticket1, ticket2]);

  console.log("Alice meta:", {
    ticket1Starred: aliceStars.starredSet.has(ticket1),
    ticket2Starred: aliceStars.starredSet.has(ticket2),
    count: aliceStars.starredCount,
  });
  console.log("Bob meta:", {
    ticket1Starred: bobStars.starredSet.has(ticket1),
    ticket2Starred: bobStars.starredSet.has(ticket2),
    count: bobStars.starredCount,
  });

  if (!aliceStars.starredSet.has(ticket1) || aliceStars.starredSet.has(ticket2)) {
    throw new Error("FAIL: Alice's stars leaked or did not register");
  }
  if (bobStars.starredSet.has(ticket1) || !bobStars.starredSet.has(ticket2)) {
    throw new Error("FAIL: Bob's stars leaked or did not register");
  }
  console.log("[PASS] Star isolation verified! Each employee has an independent private starred list.");

  // ── TEST 2: Private Folder Isolation (Alice's private folder invisible to Bob) ──
  console.log("\n--- TEST 2: Private Folder Isolation ---");
  const aliceFolderRes = await coreCreateFolder({
    name: "Alice Private Leads",
    color: "purple",
    isShared: false,
    userId: employeeA,
  });
  const aliceFolderId = aliceFolderRes.folder.id;

  // Move Ticket 1 into Alice's private folder
  await coreMoveTickets({ ticketIds: [ticket1], folderId: aliceFolderId, userId: employeeA });

  // List folders for Alice vs Bob
  const aliceList = await coreListFolders(employeeA);
  const bobList = await coreListFolders(employeeB);

  const aliceSeesFolder = aliceList.folders.some((f) => f.id === aliceFolderId);
  const bobSeesFolder = bobList.folders.some((f) => f.id === aliceFolderId);

  console.log("Alice sees private folder:", aliceSeesFolder);
  console.log("Bob sees Alice's private folder:", bobSeesFolder);

  if (!aliceSeesFolder) throw new Error("FAIL: Alice cannot see her own private folder");
  if (bobSeesFolder) throw new Error("FAIL: Bob can see Alice's private folder!");

  // Verify Bob querying Ticket 1 does not see Alice's private folder tag
  const bobTicketMeta = await getTicketOrganizationMeta(employeeB, [ticket1]);
  if (bobTicketMeta.ticketFolderMap.has(ticket1)) {
    throw new Error("FAIL: Bob sees Alice's private folder tag on Ticket 1!");
  }
  console.log("[PASS] Private folder isolation verified! Invisible to other employees.");

  // ── TEST 3: Shared Team Folder Collaboration ──
  console.log("\n--- TEST 3: Shared Team Folder Collaboration ---");
  const sharedFolderRes = await coreCreateFolder({
    name: "VIP Escalations Team",
    color: "rose",
    isShared: true,
    userId: employeeA,
  });
  const sharedFolderId = sharedFolderRes.folder.id;

  // Alice moves Ticket 2 into the shared folder
  await coreMoveTickets({ ticketIds: [ticket2], folderId: sharedFolderId, userId: employeeA });

  // Bob lists folders
  const bobListAfterShared = await coreListFolders(employeeB);
  const bobSeesShared = bobListAfterShared.folders.find((f) => f.id === sharedFolderId);

  console.log("Bob sees shared folder:", Boolean(bobSeesShared), "Ticket count:", bobSeesShared?.ticket_count);

  if (!bobSeesShared) throw new Error("FAIL: Bob cannot see the team shared folder");
  if (bobSeesShared.ticket_count !== 1) throw new Error("FAIL: Ticket count not reflected in shared folder");

  // Verify Bob sees the folder tag on Ticket 2
  const bobTicket2Meta = await getTicketOrganizationMeta(employeeB, [ticket2]);
  const sharedTag = bobTicket2Meta.ticketFolderMap.get(ticket2);
  console.log("Bob sees tag on Ticket 2:", sharedTag);
  if (!sharedTag || sharedTag.folderId !== sharedFolderId) {
    throw new Error("FAIL: Bob cannot see shared folder membership on Ticket 2");
  }
  console.log("[PASS] Shared team folder collaboration verified!");

  // ── TEST 4: Unauthorized Modification Prevention ──
  console.log("\n--- TEST 4: Unauthorized Modification & Deletion Prevention ---");
  let bobRenamedAliceFolder = false;
  try {
    await coreRenameFolder({
      folderId: aliceFolderId,
      name: "Hacked by Bob",
      userId: employeeB,
    });
    bobRenamedAliceFolder = true;
  } catch (err: any) {
    console.log("Bob rename attempt rejected as expected:", err.message);
  }

  if (bobRenamedAliceFolder) {
    throw new Error("SECURITY BREACH: Bob was able to rename Alice's private folder!");
  }

  let bobDeletedAliceFolder = false;
  try {
    await coreDeleteFolder({
      folderId: aliceFolderId,
      userId: employeeB,
    });
    // Check if Alice still has the folder
    const aliceListAfterBobDelete = await coreListFolders(employeeA);
    if (!aliceListAfterBobDelete.folders.some((f) => f.id === aliceFolderId)) {
      bobDeletedAliceFolder = true;
    }
  } catch (err: any) {
    console.log("Bob delete attempt handled:", err.message);
  }

  if (bobDeletedAliceFolder) {
    throw new Error("SECURITY BREACH: Bob was able to delete Alice's private folder!");
  }

  // Cleanup
  await coreDeleteFolder({ folderId: aliceFolderId, userId: employeeA });
  await coreDeleteFolder({ folderId: sharedFolderId, userId: employeeA });
  await coreToggleStar({ ticketId: ticket1, isStarred: false, userId: employeeA });
  await coreToggleStar({ ticketId: ticket2, isStarred: false, userId: employeeB });

  console.log("[PASS] Unauthorized modification prevention verified!");

  console.log("\n=======================================================");
  console.log("ALL 4 MULTI-EMPLOYEE PERMISSION TESTS PASSED CLEANLY!");
  console.log("=======================================================");
}

runMultiEmployeeTests().catch((e) => {
  console.error("TEST FAILED:", e);
  process.exit(1);
});
